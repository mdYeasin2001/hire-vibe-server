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
const protect = (req, res, next) => {
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
    const appliedJobsCollection = client.db('hire-vibe').collection('applications')


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
    app.get('/jobs/:id', async (req, res) => {
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
    app.get('/jobs/get-mine/:email', protect, async (req, res) => {
      const tokenEmail = req.user.email
      const email = req.params.email
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "access forbidden" })
      }
      const query = { creator_email: email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    //delete a job data
    app.delete('/jobs/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      await appliedJobsCollection.deleteMany({ job_id: id })
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })

    //update a job
    app.put('/jobs/:id', async (req, res) => {
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
    app.post('/applications', protect, async (req, res) => {
      const tokenEmail = req.user.email
      const appliedJobData = req.body
      const job = await jobsCollection.findOne({ _id: new ObjectId(appliedJobData.job_id) })
      if (!job) {
        return res.status(404).send({ message: "Job not found" })
      }

      if (tokenEmail == job.creator_email) {
        return res.status(400).send({ message: "You can't apply to your own created job" })
      }

      const jobDeadline = new Date(job.deadline);
      const currentDate = new Date();

      // Set specific hours and minutes for both dates
      jobDeadline.setHours(23, 59, 59, 999); // Set to end of the day
      currentDate.setHours(0, 0, 0, 0);

      if (jobDeadline < currentDate) {
        return res.status(400).send({ message: "Deadline has expired" })
      }

      const foundJob = await appliedJobsCollection.findOne({ job_id: appliedJobData.job_id, email: appliedJobData.email })

      if (foundJob) {
        return res.status(400).send({ message: "You have already applied to this job" })
      }

      const result = await appliedJobsCollection.insertOne(appliedJobData)
      //updating applicants number
      const jobId = appliedJobData.job_id;
      const updateDoc = {
        $inc: { applicants_number: 1 },
      }
      const jobQuery = { _id: new ObjectId(jobId) }
      await jobsCollection.updateOne(jobQuery, updateDoc)
      res.send(result)
    })

    //get all applied jobs data for user
    app.get('/applications/:email', protect, async (req, res) => {
      const tokenEmail = req.user.email
      const email = req.params.email
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "access forbidden" })
      }
      const query = { email: email }
      const result = await appliedJobsCollection.aggregate([
        {
          $match: query
        },
        {
          $addFields: {
            job_id: { $toObjectId: "$job_id" }
          }
        },
        {
          $lookup: {
            from: 'jobs',
            let: { jobId: "$job_id" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$jobId"] } } },
              { $limit: 1 } // Limit to only one job document
            ],
            as: 'job'
          }
        },
        { $unwind: "$job" },
        {
          $match: req.query.job_type ? { 'job.job_type': req.query.job_type } : {}
        }
      ]).toArray()
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