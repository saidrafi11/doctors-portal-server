const express = require('express')
const cors = require('cors')
const port = process.env.PORT || 5000
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken')
const { query } = require('express');
require('dotenv').config();

const app = express( )
// middleware
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.nrfxvyb.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next){
    console.log(req.headers.authorization)
    const authHeader = req.headers.authorization
    if(!authHeader) {
        return res.status(401).send('unauthorized access')
    }
    const token = authHeader.split(' ')[1]

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}

async function run(){
try{
    const appointmentOptionsCollection = client.db('doctors-portal').collection('appointment-options')
    const bookingsCollections = client.db('doctors-portal').collection('bookings')
    const usersCollections = client.db('doctors-portal').collection('users')
    const doctorsCollections = client.db('doctors-portal').collection('doctors')
    
    // Make sure you use verifyAdmin after verifyJwt
    const verifyAdmin = async(req, res, next)=> {
        
        // const decodedEmail = req.decoded.email;
        const decodedEmail = req.decoded.email;
        const query = {email: decodedEmail}
        const user = await usersCollections.findOne(query);
        if(user?.role !== 'admin'){
            return res.status(403).send({message: 'Forbidden access'})
        }
        next()
    }

    app.get('/appointmentoptions', async(req,res)=> {
        const date = req.query.date
        console.log(date)
        const query = {}
        const options = await appointmentOptionsCollection.find(query).toArray()

        // Get the bookings of the provided date
        const bookingQuery = {appointmentDate: date}
        const alreadyBooked = await bookingsCollections.find(bookingQuery).toArray()

        // Code carefully
        options.forEach(option =>{
            const optionBooked = alreadyBooked.filter(book => book.treatment === option.name)
            // console.log(optionBooked)
            const bookedSlots = optionBooked.map(book => book.slot)
            const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
            option.slots = remainingSlots
            // console.log(option.name, bookedSlots, remainingSlots.length)
        })
        res.send(options)
    })


    app.get('/allusers',async(req, res)=>{
        const query = {}
        const users = await usersCollections.find(query).toArray()
        res.send(users)
    })

    app.get('/bookings', verifyJWT, async(req,res)=>{
        const email = req.query.email
        console.log(email)
        const decodedEmail = req.decoded.email;
        console.log(decodedEmail)
        if(email !== decodedEmail){
            return res.status(403).send({message: 'forbidden access'})
        }
        const query = {email: email}
        const bookings = await bookingsCollections.find(query).toArray()
        res.send(bookings)
    })
// nnnn

    app.get('/bookings/:id', async(req, res)=>{
        const id = req.params.id
        const query = {_id: ObjectId(id)}
        const booking = await bookingsCollections.findOne(query);
        console.log(booking);
        res.send(booking)
    })

    // app.get('/appointmentoptions', async(req, res)=> {
    //     const query = { }
    //     const options = await appointmentOptionsCollection.find(query).toArray();
    //     res.send(options)
    // })

    app.post('/bookings', async(req, res)=>{
        const booking = req.body
        // console.log(booking)
        const query ={
            appointmentDate: booking.appointmentDate,
            email:booking.email,
            treatment: booking.treatment
        }
        const alreadyBooked = await bookingsCollections.find(query).toArray();

        if(alreadyBooked.length){
            const message = `You already have a  booking on ${booking.appointmentDate}`
            return res.send({
                acknowledged: false, message
            })
        }
        const result = await bookingsCollections.insertOne(booking)
        res.send(result)

    })

    app.get('/users/admin/:email', async(req, res)=> {
        const email = req.params.email;
        const query = {email}
        const user = await usersCollections.findOne(query)
        res.send({isAdmin: user?.role === 'admin'})
    })




    app.get('/appointmentspeciality', async(req, res)=> {
        const query = {}
        const result = await appointmentOptionsCollection.find(query).project({name:1}).toArray()
        res.send(result)
    })

    app.put('/users/admin/:id',verifyJWT,verifyAdmin, async(req, res)=>{

        // admin role
        const decodedEmail= req.decoded.email;
        const query = {email: decodedEmail}
        const user = await usersCollections.findOne(query);
        if(user?.role !== 'admin'){
            return res.status(403).send({message: 'Forbidden access'})
        }


        // veryfy jwt
        const id = req.params.id;
        const filter = {_id: ObjectId(id)}
        const option = {upsert: true}
        const updateDoc = {
            $set: {
                role:'admin'
            }
            
        }
        const result = await usersCollections.updateOne(filter, updateDoc, option)
        res.send(result);
    })

    app.get('/jwt', async(req, res)=>{
        const email = req.query.email;
        console.log(email)
        // get the email from client
        const query = {email: email}
        // search user by email 
        const user = await usersCollections.findOne(query);
        // generate token
        if(user){
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn: '1h'})
            return res.send({accessToken: token})
        }
     
        res.status(403).send({accessToken: ''})

    })

    app.delete('/doctors/:id',verifyJWT, async(req, res)=> {
        const id = req.params.id;
       
        const filter = { _id: ObjectId(id)}
      
        const result = await doctorsCollections.deleteOne(filter);
        res.send(result);
    })

    app.get('/doctors',   async(req, res)=>{
        const query = {}
        const doctors = await doctorsCollections.find(query).toArray()
        // console.log(doctors)
        res.send(doctors)
    })

    app.post('/users', async(req, res)=> {
        const user = req.body;
        const result = await usersCollections.insertOne(user);
        res.send(result)
    })

    app.post('/doctors',verifyJWT, async(req, res)=>{
        const doctors = req.body;
        const result = await doctorsCollections.insertOne(doctors)
        res.send(result)
    })

    // app.get('/addPrice', async (req, res) => {
    //     const filter = {}
    //     const options = { upsert: true}
    //     const updateDoc = {
    //         $set:{
    //             price: 99
    //         }
    //     }
    //     const result = await appointmentOptionsCollection.updateMany(filter, updateDoc, options)
    //     res.send(result)
    // })


}
finally{

}
}
run().catch(console.log)

app.get('/', async(req, res)=>{
    res.send('Doctors portal running')
})

app.listen(port, ()=> console.log(`doctors portal runnig on ${port}`))