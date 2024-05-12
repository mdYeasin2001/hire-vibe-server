const express = require('express');
const cors = require('cors');
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
app.use(cors({ corsOptions }))
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4wc44xb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    const jobsCollection = client.db('jobHive').collection('jobs')
    const appliedJobsCollection = client.db('jobHive').collection('appliedJobs')


    //get all jobs data from mongodb
    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray()
      res.send(result)
    })

    //get single job data
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    //save a job data in db
    app.post('/job', async (req, res) => {
      const jobData = req.body
      const result = await jobsCollection.insertOne(jobData)
      res.send(result)
    })

    //get jobs posted by a user
    app.get('/jobs/:email', async (req, res) => {
      const email = req.params.email
      const query = { 'employer.email': email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    //delete a job data
    app.delete('/jobs/:id', async (req, res) => {
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await jobsCollection.deleteOne(query)
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