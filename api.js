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
      var query = "INSERT INTO public.users(first_name,last_name,password,email,phone,credential) VALUES ($1,$2,$3,$4,$5,$6)"
      var firstName = req.body.firstName
      var lastName = req.body.lastName
      var credential = req.body.credential
      try{
        var result = await client.query(query, [firstName, lastName, hash, email, phone, credential])
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
    res.status(200).json({message: "Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/parkings/closest/:latitude/:longitude', async function (req, res ){
  let latitude = parseFloat(req.params.latitude)
  let longitude = parseFloat(req.params.longitude)
  const query = "SELECT * FROM (SELECT *, \n" +
      "SQRT( POW( ( (69.1/1.61) * ($1 - latitude)), 2) \n" +
      "+ POW(( (53/1.61) * ($2 - longitude)), 2)) AS distance \n" +
      "FROM public.parkings) as p, \n" +
      "TO_JSON(ARRAY (SELECT \n" +
      "\t   (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS'))\n" +
      "\t   FROM public.schedules\n" +
      "\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "FROM public.parkings) \n" +
      "WHERE distance < 3";
  try {
    let result = await client.query(query, [latitude, longitude])
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: toString(req.params.latitude) + " " + toString(req.params.latitude) })
  }
})

app.get('/reservations/byUser/:userId',async function(req,res){
  const query = "SELECT * FROM public.reservations WHERE user_reservation = $1"
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
  const query = "SELECT COUNT() as count FROM public.reservations WHERE parking_reservation = $1 AND is_over = 0 GROUP BY *"
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

app.listen(process.env.PORT, () => {
  console.log(`Example app listening on port $process.env.PORT`)
})