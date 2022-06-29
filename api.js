const express = require("express")
const { Client } = require('pg')
const Maps= require("@googlemaps/google-maps-services-js");
const bcrypt = require('bcryptjs')
const cors = require('cors')
const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
})

const mapsClient = new Maps.Client()

client.connect()

const bodyParser = require('body-parser')
const {ssl} = require("pg/lib/defaults");
const {response} = require("express");
const app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(bodyParser.raw())
app.use(cors())
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
  const query = "UPDATE public.users SET credential = $1 WHERE user_id = $2"
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

app.post('/addImageUrl', async function (req, res) {
  const userId = req.body.userId
  const url = req.body.url
  const query = "UPDATE public.users SET image_url = $1 WHERE user_id = $2"
  try {
    let result = await client.query(query, [url,userId])
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
          res.status(200).json({message: "Login successful", userInfo: result.rows[0]})
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
        res.status(200).json({message: "Login successful", userInfo: result.rows[0]})
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
  const query = "SELECT *, NBAVAILABLE(parking_id) as nb_available, \n" +
      "TO_JSON(ARRAY (SELECT \n" +
      "\t   (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS'))\n" +
      "\t   FROM public.schedules\n" +
      "\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "FROM public.parkings p, (SELECT \n" +
      "\t \tAVG(evaluation)::numeric(2,1)::text as evaluation, \n" +
      "\t \tparking_evaluation \n" +
      "\t from public.evaluations \n" +
      "\t GROUP BY parking_evaluation) as e \n" +
      "\t WHERE p.parking_id = e.parking_evaluation"
  try{
    let result = await client.query(query)
    res.status(200).json({message: "Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/parkings/advanced', async function (req, res ){
  const query =
      "SELECT * FROM (SELECT *, NBAVAILABLE(parking_id) as nb_available, \n" +
      "\t\t\t   SQRT( POW( ( (69.1/1.61) * ($1 - latitude)), 2)\n" +
      "               + POW(( (53/1.61) * ($2 - longitude)), 2)) AS distance,\n" +
      "\t\t\t   TO_JSON(ARRAY (SELECT (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS')) \n" +
      "\t\t\t\t\t\t\t  FROM public.schedules\n" +
      "\t\t\t\t\t\t\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "\t\t\t   FROM public.parkings WHERE price <= $4) as p, (SELECT \n" +
      "\t \t AVG(evaluation)::numeric(2,1)::text as evaluation, \n" +
      "\t \t parking_evaluation \n" +
      "\t from public.evaluations \n" +
      "\t GROUP BY parking_evaluation) as e \n" +
      "\t\t\t   WHERE p.distance <= $3 AND p.parking_id = e.parking_evaluation" +
      "\t\t\t   LIMIT 25"
  try {
    let result = await client.query(query, [req.query.latitude, req.query.longitude, req.query.maxDistance, req.query.price])
    let array= result.rows
    let arrayLength = array.length
    let destinations = []
    let origins = [
      {lat:req.query.latitude,
        lng:req.query.longitude}
    ]
    if (arrayLength>0) {
      let googleDistanceMatrix = await mapsClient.distancematrix({
        params: {
          destinations: JSON.parse(JSON.stringify(destinations)),
          origins: JSON.parse(JSON.stringify(origins)),
          key: process.env.MAPS_API_KEY
        }})
      for (let i = 0; i<arrayLength; i++){
        array[i]["distance"]=googleDistanceMatrix.data.rows[0].elements[i].distance.value/1000
        array[i]["time"]=googleDistanceMatrix.data.rows[0].elements[i].duration.text
      }
      result.rows = array.filter(data => data.distance <= req.query.maxDistance)
    }
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})

app.get('/parkings/closest', async function (req, res ){
  const query =
      "SELECT * FROM (SELECT *, NBAVAILABLE(parking_id) as nb_available, \n" +
      "\t\t\t   SQRT( POW( ( (69.1/1.61) * ($1 - latitude)), 2)\n" +
      "               + POW(( (53/1.61) * ($2 - longitude)), 2)) AS distance,\n" +
      "\t\t\t   TO_JSON(ARRAY (SELECT (day,to_char(opening_hour, 'HH24:MI:SS'),to_char(closing_hour,'HH24:MI:SS')) \n" +
      "\t\t\t\t\t\t\t  FROM public.schedules\n" +
      "\t\t\t\t\t\t\t  WHERE parking_schedule = parking_id)) as schedule\n" +
      "\t\t\t   FROM public.parkings) as p, (SELECT \n" +
      "\t \t AVG(evaluation)::numeric(2,1)::text as evaluation, \n" +
      "\t \t parking_evaluation \n" +
      "\t from public.evaluations \n" +
      "\t GROUP BY parking_evaluation) as e \n" +
      "\t\t\t   WHERE p.distance <= 3.0 AND p.parking_id = e.parking_evaluation \n" +
      "\t\t\t   LIMIT 25"
  try {
    let result = await client.query(query, [req.query.latitude, req.query.longitude])
    let array= result.rows
    let arrayLength = array.length
    let destinations = []
    let origins = [
        {lat:req.query.latitude,
          lng:req.query.longitude}
    ]
    for (let i = 0; i<arrayLength;i++){
      destinations.push([array[i]["latitude"],array[i]["longitude"]])
    }
    if (arrayLength>0) {
      let googleDistanceMatrix = await mapsClient.distancematrix({
        params: {
          destinations: JSON.parse(JSON.stringify(destinations)),
          origins: JSON.parse(JSON.stringify(origins)),
          key: process.env.MAPS_API_KEY
        }})
      for (let i = 0; i<arrayLength; i++){
        array[i]["distance"]=googleDistanceMatrix.data.rows[0].elements[i].distance.value/1000
        array[i]["time"]=googleDistanceMatrix.data.rows[0].elements[i].duration.text
        array[i]["google_destination"]=googleDistanceMatrix.data.destination_addresses[i]
      }
    }
    result.rows = array.filter(data => data.distance <= 3.0)
    res.status(200).json({message:"Success", result: result})
  }
  catch(err){
    console.log(err)
    res.status(500).json({message: "Error when querying"})
  }
})


app.get('/reservations/byUser/:userId',async function(req,res){
  const query = "SELECT r.*, p.* FROM public.reservations r, public.parkings p " +
      "WHERE user_reservation = $1 AND is_over = FALSE AND r.parking_reservation = p.parking_id "
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
  const testQuery = "SELECT p.nb_places , ps.* FROM (SELECT \n" +
      "\t\t\t\t\t\t\t   p1.parking_schedule, freespot($3) as spot,\n" +
      "\t\t\t\t\t\t\t   p1.day as day_one, p1.opening_hour as opening_day_one, p1.closing_hour as closing_day_one,\n" +
      "\t\t\t\t\t\t\t   p2.day as day_two, p2.opening_hour as opening_day_two, p2.closing_hour as closing_day_two\n" +
      "\t\t\t\t\t\t\t   FROM public.schedules p1\n" +
      "\t\t\t\t\t\t\t   INNER JOIN public.schedules p2 \n" +
      "\t\t\t\t\t\t\t   \tON p2.day = (EXTRACT(DOW FROM $2::TIMESTAMP )+1) AND p1.parking_schedule = p2.parking_schedule \n" +
      "\t\t\t\t\t\t\t   WHERE p1.day = (EXTRACT(DOW FROM  $1::TIMESTAMP )+1)) ps, public.parkings p \n" +
      "\t\t\t\t\t\t\t   WHERE ( $1 ::time BETWEEN opening_day_one AND closing_day_one) \n" +
      "\t\t\t\t\t\t\t   \t\t\tAND ( $2 ::time BETWEEN opening_day_two AND closing_day_two) \n" +
      "\t\t\t\t\t\t\t   \t\t\tAND (spot <= p.nb_places) \n" +
      "\t\t\t\t\t\t\t   \t\t\tAND parking_schedule = p.parking_id \n" +
      "\t\t\t\t\t\t\t   \t\t\tAND parking_id = $3" // $1 day_one, $2 day_two, $3 parking_id
  const query = "INSERT INTO public.reservations (user_reservation, parking_reservation, start_time, end_time, is_over, parking_spot) " +
      "VALUES ($1, $2, $3, $4, false, freespot($2))"
  try{
    let testResult = await client.query(testQuery,[req.body.startTime,req.body.endTime,req.body.parkingId])
    if (testResult.rowCount>0){
      let result = await client.query(query,[req.body.userId,req.body.parkingId,req.body.startTime,req.body.endTime])
      res.status(200).json({message: "Success"})
    }
    else res.status(400).json({message: "Parking is either closed at check-in/check-out, or currently full"})
  }
  catch(err){
    console.log(err)
    res.status(500).json(err)
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
  const query = "SELECT c.*, u.first_name, u.last_name, u.image_url FROM public.comments c, public.users u WHERE c.user_comment = u.user_id AND parking_comment = $1"
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

app.post('/evaluations', async function(req,res){
  const query = "INSERT INTO public.evaluations(user_evaluation, parking_evaluation, evaluation) \n"+
                "\t VALUES ($1, $2, $3) \n"+
                "\t ON CONFLICT ON CONSTRAINT evaluation_unicity DO \n"+
                "\t UPDATE SET evaluation = $3"
  try{
    let result = await client.query(query,[req.body.userId,req.body.parkingId,req.body.evaluation])
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