const express = require('express');
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 9000;

const app = express()

//middleware

const corsOptions = {
    origin: ['http://localhost:5173'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors({corsOptions}))
app.use(express.json())

app.get('/',(req,res)=>[
    res.send('Job Hive server is running...')
])

app.listen(port, ()=>console.log(`Job hive server is running on port ${port}`))