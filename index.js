const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 9000;

const app = express()

//middleware

const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  optionSuccessStatus: 200,
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

//verify jwt middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token
  if (!token) return res.status(401).send({ message: "unauthorized access" })
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        console.log(err);
        return res.status(401).send({ message: "unauthorized access" })
      }
      console.log(decoded);
      req.user = decoded
      next()
    })
  }
}



const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASSWORD}@cluster0.q62z2i6.mongodb.net/hire-vibe?retryWrites=true&w=majority&`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {

    const jobsCollection = client.db('hire-vibe').collection('jobs')
    const appliedJobsCollection = client.db('hire-vibe').collection('appliedJobs')


    //jwt
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30d' })
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
      }).send({ success: true })
    })

    //clear token when logout
    app.get('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 0
      }).send({ success: true })
    })


    //get all jobs data from mongodb
    app.get('/jobs', async (req, res) => {
      const { job_type, search } = req.query
      let query = {}
      if (job_type) {
        query = { job_type }
      }
      if (search) {
        query = { job_title: { $regex: search, $options: 'i' } }
      }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    //get single job data
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    //add a job data in db
    app.post('/jobs', async (req, res) => {
      const jobData = req.body
      const result = await jobsCollection.insertOne(jobData)
      res.send(result)
    })

    //get jobs posted by a user
    app.get('/jobs/:email', verifyToken, async (req, res) => {
      const tokenEmail = req.user.email
      const email = req.params.email
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "access forbidden" })
      }
      const query = { 'employer.email': email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    //delete a job data
    app.delete('/jobs/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })

    //update a job
    app.put('/job/:id', async (req, res) => {
      const id = req.params.id
      const jobData = req.body
      const query = { _id: new ObjectId(id) }
      const options = {
        upsert: true
      }
      const updateDoc = {
        $set: {
          ...jobData
        }
      }
      const result = await jobsCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })

    //save an applied job data in db
    app.post('/appliedJob', async (req, res) => {
      const appliedJobData = req.body
      const result = await appliedJobsCollection.insertOne(appliedJobData)
      //updating applicants number
      const jobId = appliedJobData.jobId;
      const updateDoc = {
        $inc: { applicants_number: 1 },
      }
      const jobQuery = { _id: new ObjectId(jobId) }
      const updateApplicantsNo = await jobsCollection.updateOne(jobQuery, updateDoc)
      res.send(result)
    })

    //get all applied jobs data for user
    app.get('/appliedJobs/:email', verifyToken, async (req, res) => {
      const tokenEmail = req.user.email
      const email = req.params.email
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "access forbidden" })
      }
      const query = { email: email }
      const result = await appliedJobsCollection.find(query).toArray()
      res.send(result)
    })

    //get single applied job data
    app.get('/appliedJob/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await appliedJobsCollection.findOne(query)
      res.send(result)
    })



    // Send a ping to confirm a successful connection
    //   await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //   await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => [
  res.send('Job Hive server is running...')
])

app.listen(port, () => console.log(`Job hive server is running on port ${port}`))