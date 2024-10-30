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

// Improved JWT middleware with better error handling
const protect = (req, res, next) => {
  try {
    const token = req.cookies?.token
    if (!token) {
      return res.status(401).send({ message: "Please login first" })
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "Invalid token" })
      }
      req.user = decoded
      next()
    })
  } catch (error) {
    res.status(500).send({ message: "Internal server error" })
  }
}

// MongoDB Connection URI
const uri = `mongodb+srv://${process.env.DB_USER_NAME}:${process.env.DB_PASSWORD}@cluster0.q62z2i6.mongodb.net/hire-vibe?retryWrites=true&w=majority&`;

// MongoDB Client Configuration
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Database Collections
    const jobsCollection = client.db('hire-vibe').collection('jobs')
    const appliedJobsCollection = client.db('hire-vibe').collection('applications')

    // Authentication Routes
    app.post('/jwt', async (req, res) => {
      try {
        const user = req.body
        const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '30d' })
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        }).send({ success: true })
      } catch (error) {
        res.status(500).send({ message: "Error creating token" })
      }
    })

    app.get('/logout', (req, res) => {
      try {
        res.clearCookie('token', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          maxAge: 0
        }).send({ success: true })
      } catch (error) {
        res.status(500).send({ message: "Error logging out" })
      }
    })

    // Jobs Routes
    app.get('/jobs', async (req, res) => {
      try {
        const { job_type, search } = req.query
        let query = {}

        if (job_type) query.job_type = job_type
        if (search) query.job_title = { $regex: search, $options: 'i' }

        const result = await jobsCollection.find(query).toArray()
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error fetching jobs" })
      }
    })

    app.get('/jobs/:id', async (req, res) => {
      try {
        const result = await jobsCollection.findOne({
          _id: new ObjectId(req.params.id)
        })
        if (!result) {
          return res.status(404).send({ message: "Job not found" })
        }
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error fetching job" })
      }
    })

    app.post('/jobs', protect, async (req, res) => {
      try {
        const result = await jobsCollection.insertOne(req.body)
        res.status(201).send(result)
      } catch (error) {
        res.status(500).send({ message: "Error creating job" })
      }
    })

    app.get('/jobs/get-mine/:email', protect, async (req, res) => {
      try {
        const { email } = req.params
        if (req.user.email !== email) {
          return res.status(403).send({ message: "Access forbidden" })
        }

        const result = await jobsCollection.find({
          creator_email: email
        }).toArray()
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error fetching your jobs" })
      }
    })

    app.delete('/jobs/:id', protect, async (req, res) => {
      try {
        const { id } = req.params
        await appliedJobsCollection.deleteMany({ job_id: id })
        const result = await jobsCollection.deleteOne({
          _id: new ObjectId(id)
        })
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error deleting job" })
      }
    })

    app.put('/jobs/:id', protect, async (req, res) => {
      try {
        const result = await jobsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: req.body },
          { upsert: true }
        )
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error updating job" })
      }
    })

    // Applications Routes
    app.post('/applications', protect, async (req, res) => {
      try {
        const { job_id, email } = req.body

        // Validate job exists
        const job = await jobsCollection.findOne({
          _id: new ObjectId(job_id)
        })
        if (!job) {
          return res.status(404).send({ message: "Job not found" })
        }

        // Check if user is applying to their own job
        if (req.user.email === job.creator_email) {
          return res.status(400).send({ message: "You can't apply to your own job" })
        }

        // Check deadline
        const jobDeadline = new Date(job.deadline)
        const currentDate = new Date()
        jobDeadline.setHours(23, 59, 59, 999)
        currentDate.setHours(0, 0, 0, 0)

        if (jobDeadline < currentDate) {
          return res.status(400).send({ message: "Application deadline has passed" })
        }

        // Check for duplicate application
        const existingApplication = await appliedJobsCollection.findOne({
          job_id, email
        })
        if (existingApplication) {
          return res.status(400).send({ message: "You have already applied" })
        }

        // Save application and update applicants count
        const result = await appliedJobsCollection.insertOne(req.body)
        await jobsCollection.updateOne(
          { _id: new ObjectId(job_id) },
          { $inc: { applicants_number: 1 } }
        )

        res.status(201).send(result)
      } catch (error) {
        res.status(500).send({ message: "Error submitting application" })
      }
    })

    app.get('/applications/:email', protect, async (req, res) => {
      try {
        const { email } = req.params
        if (req.user.email !== email) {
          return res.status(403).send({ message: "Access forbidden" })
        }

        const result = await appliedJobsCollection.aggregate([
          { $match: { email } },
          {
            $addFields: {
              job_id: { $toObjectId: "$job_id" }
            }
          },
          {
            $lookup: {
              from: 'jobs',
              localField: 'job_id',
              foreignField: '_id',
              as: 'job'
            }
          },
          { $unwind: "$job" },
          {
            $match: req.query.job_type ? {
              'job.job_type': req.query.job_type
            } : {}
          }
        ]).toArray()

        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error fetching applications" })
      }
    })

    app.get('/appliedJob/:id', protect, async (req, res) => {
      try {
        const result = await appliedJobsCollection.findOne({
          _id: new ObjectId(req.params.id)
        })
        if (!result) {
          return res.status(404).send({ message: "Application not found" })
        }
        res.send(result)
      } catch (error) {
        res.status(500).send({ message: "Error fetching application" })
      }
    })

    console.log("Successfully connected to MongoDB!");
  } finally {
    // Connection will be closed when app terminates
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Job Hive server is running...')
})

app.listen(port, () => console.log(`Job hive server is running on port ${port}`))