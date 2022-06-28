const express = require("express")
const { Client } = require('pg')
const bcrypt = require('bcryptjs')

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
})
client.connect()

const bodyParser = require('body-parser')
const {ssl} = require("pg/lib/defaults");
const {response} = require("express");
const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(bodyParser.raw())
app.use(express.static('public'))

app.post('/signup',async function (req, res) {
  const password = await req.body.password
  bcrypt.genSalt(10, function(err, salt) {
    bcrypt.hash(password, salt, async function (err, hash) {
      var email = req.body.email
      if (!email) console.log("No email !")
      var phone = parseInt(req.body.phone,10)
      if (!phone) console.log ("No phone !")
      var query = "INSERT INTO public.users(first_name,last_name,password,email,phone) VALUES ($1,$2,$3,$4,$5)"
      var firstName = req.body.firstName
      var lastName = req.body.lastName
      var credential = req.body.credential
      try{
        var result = await client.query(query, [firstName, lastName, hash, email, phone])
        console.log(result)
        res.status(200).json({message: "Success"})
      }
      catch(err){
        console.log(err.stack)
        res.status(400).json({message: err.stack})
      }
    });
  });
})

app.post('/addGoogleCredential', async function (req, res) {
  const userId = req.body.userId
  const credential = req.body.credential
  const query = "INSERT INTO public.users (credential) VALUES ($1) WHERE user_id = $2"
  try {
    let result = await client.query(query, [credential,userId])
    console.log(result)
    res.status(200).json({message: "Success"})
  }
  catch(e){
    console.log(e)
    res.status(500).json({message: "Error when querying"})
  }
})

app.post('/login', async function (req, res) {
  const email = req.body.email
  const password = req.body.password
  const query = "SELECT * FROM public.users WHERE email=$1"
  try {
    let result = await client.query(query, [email])
    try {
      console.log(result.rows)
      if (result.rows.length === 0) {
        res.status(400).json({message: "Invalid email"})
      } else {
        if (bcrypt.compareSync(password, result.rows[0].password)) {
          res.status(200).json({message: "Login successful", userId: result.rows[0].user_id.toString()})
        } else res.status(400).json({message: "Incorrect password"})
      }
    } catch (err) {
      console.log(err)
      res.status(500).json({message: "Internal server error"})
    }
  } catch (err) {
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.post('/loginWithGoogle', async function (req, res) {
  const credential = req.body.credential
  const query = "SELECT * FROM public.users WHERE credential=$1"
  try {
    let result = await client.query(query, [credential])
    try {
      console.log(result.rows)
      if (result.rows.length === 0) {
        res.status(400).json({message: "No corresponding Google Account."})
      } else {
        res.status(200).json({message: "Login successful", userId: result.rows[0].user_id.toString()})
      }
    } catch (err) {
      console.log(err)
      res.status(500).json({message: "Internal server error"})
    }
  } catch (err) {
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/parkings', async function (req, res){
  const query = "SELECT *,\n" +
      "TO_JSON(ARRAY (SELECT \n" +
      "\t   (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS'))\n" +
      "\t   FROM public.schedules\n" +
      "\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "FROM public.parkings"
  try{
    let result = await client.query(query)
    res.status(200).json({message: "Success", result: result.rows})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/parkings/closest', async function (req, res ){
  const query =
      "SELECT * FROM (SELECT *, \n" +
      "\t\t\t   SQRT( POW( ( (69.1/1.61) * ($1 - latitude)), 2)\n" +
      "               + POW(( (53/1.61) * ($2 - longitude)), 2)) AS distance,\n" +
      "\t\t\t   TO_JSON(ARRAY (SELECT (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS')) \n" +
      "\t\t\t\t\t\t\t  FROM public.schedules\n" +
      "\t\t\t\t\t\t\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "\t\t\t   FROM public.parkings) as p\n" +
      "\t\t\t   WHERE p.distance < 2.20"
  try {
    let result = await client.query(query, [req.query.latitude, req.query.longitude])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})
app.get('/parkings/advanced', async function (req, res ){
  const query =
      "SELECT * FROM (SELECT *, \n" +
      "\t\t\t   SQRT( POW( ( (69.1/1.61) * ($1 - latitude)), 2)\n" +
      "               + POW(( (53/1.61) * ($2 - longitude)), 2)) AS distance,\n" +
      "\t\t\t   TO_JSON(ARRAY (SELECT (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS')) \n" +
      "\t\t\t\t\t\t\t  FROM public.schedules\n" +
      "\t\t\t\t\t\t\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "\t\t\t   FROM public.parkings WHERE p.price <= $4) as p\n" +
      "\t\t\t   WHERE p.distance < $3"
  try {
    let result = await client.query(query, [req.query.latitude, req.query.longitude, req.query.maxDistance, req.query.price])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/reservations/byUser/:userId',async function(req,res){
  const query = "SELECT r.*, p.* FROM public.reservations r, public.parkings p WHERE user_reservation = $1 AND is_over = FALSE r.parking_reservation = p.parking_id "
  try {
    let result = await client.query(query, [req.params.userId])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/reservations/byParking/:parkingId',async function(req,res){
  const query = "SELECT COUNT(*) as count FROM public.reservations WHERE parking_reservation = $1 AND is_over = false"
  try {
    let result = await client.query(query, [req.params.parkingId])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.post('/reservations',async function(req,res){
  const query = "INSERT INTO public.reservations (user_reservation, parking_reservation, start_time, end_time, is_over) " +
      "VALUES ($1, $2, $3, $4, false)"
  try{
    let result = await client.query(query,[req.body.userId,req.body.parkingId,req.body.startTime,req.body.endTime])
    res.status(200).json({message: "Success"})
  }
  catch(err){
    console.log(err)
    res.status(400).json(err)
  }
})

app.put('/reservations',async function(req,res){
  const query = "UPDATE public.reservations SET end_time = NOW(), is_over = true WHERE reservation_id = $1"
  try{
    let result = await client.query(query,[req.body.reservationId])
    res.status(200).json({message: "Success"})
  }
  catch(err){
    console.log(err)
    res.status(400).json(err)
  }
})

app.get('/comments/:parkingId', async function(req,res){
  const query = "SELECT * FROM public.comments WHERE parking_comment = $1"
  try{
    let result = await client.query(query,[req.params.parkingId])
    res.status(200).json({message:"Success", result: result})

  }catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.post('/comments', async function(req,res){
  const query = "INSERT INTO public.comments (user_comment, parking_comment, comment, comment_timestamp) VALUES" +
      "($1,$2,$3,NOW())"
  try{
    let result = await client.query(query,[req.body.userId,req.body.parkingId,req.body.comment])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
      console.log(err)
      res.status(500).json({message:"Failure", error:err})
  }
})

app.listen(process.env.PORT, () => {
  console.log(`Example app listening on port $process.env.PORT`)
})