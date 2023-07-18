const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware
const corsConfig = {
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
};
app.use(cors(corsConfig));
app.options("", cors(corsConfig));
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zfoefnx.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();

    const usersCollection = client.db("languageSchoolDb").collection("users");
    const classesCollection = client
      .db("languageSchoolDb")
      .collection("classes");
    const cartCollection = client.db("languageSchoolDb").collection("cart");
    const paymentCollection = client
      .db("languageSchoolDb")
      .collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "5h",
      });

      res.send({ token });
    });

    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };
    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "student") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // ------------users related apis---------------------

    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/userRole/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const options = {
        projection: {
          role: 1,
        },
      };
      const result = await usersCollection.findOne(query, options);
      res.send(result);
    });

    app.get("/isUser/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ result: true });
      } else {
        return res.send({ result: false });
      }
    });

    // app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
    //   const result = await usersCollection.find().toArray();
    //   res.send(result);
    // });

    app.post("/addUser", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // delete user
    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // ------------admin related apis---------------------
    // check admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get all classes
    app.get("/allclasses", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });
    // get all classes
    app.get("/classes", async (req, res) => {
      const query = { status: "approved" };
      const result = await classesCollection
        .find(query)
        .sort({ availableSeats: -1 })
        .toArray();
      res.send(result);
    });
    // get class by id
    app.get("/class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const options = {
        projection: {
          _id: 1,
          classImage: 1,
          className: 1,
          price: 1,
          status: 1,
          feedback: 1,
        },
      };
      const result = await classesCollection.findOne(query, options);
      res.send(result);
    });

    // update class feedback
    app.patch("/class-feedback/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClass = req.body;
      const newValues = {
        $set: {
          feedback: updatedClass.feedback,
        },
      };
      const result = await classesCollection.updateOne(filter, newValues);
      res.send(result);
    });

    // update class status
    app.patch("/class-status/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedClass = req.body;
      const newValues = {
        $set: {
          status: updatedClass.status,
        },
      };
      const result = await classesCollection.updateOne(filter, newValues);
      res.send(result);
    });

    // del class by id
    app.delete("/delClass/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.deleteOne(query);
      res.send(result);
    });

    // ------------instructor related apis---------------------
    // check instructor
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    // get all instructors
    app.get("/instructors", async (req, res) => {
      const result = await usersCollection
        .find({ role: "instructor" })
        .toArray();
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      // console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/addClasses", async (req, res) => {
      const classInfo = req.body;
      const result = await classesCollection.insertOne(classInfo);
      res.send(result);
    });

    app.get("/myclasses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };
      const options = {
        projection: {
          _id: 1,
          classImage: 1,
          className: 1,
          availableSeats: 1,
          totalSeats: 1,
          status: 1,
          feedback: 1,
        },
      };
      const result = await classesCollection.find(query, options).toArray();
      res.send(result);
    });

    // ------------student related apis---------------------

    // check student
    app.get("/users/student/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ student: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === "student" };
      res.send(result);
    });
    // add selected class by student
    app.post("/addSelectedClass", async (req, res) => {
      const classInfo = req.body;
      const result = await cartCollection.insertOne(classInfo);
      res.send(result);
    });

    // my selected class
    app.get("/mySelectedClasses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { $and: [{ email: email }, { isEnrolled: 0 }] };
      const options = {
        projection: {
          _id: 1,
          classImage: 1,
          className: 1,
          price: 1,
          classId: 1,
        },
      };
      const result = await cartCollection.find(query, options).toArray();

      res.send(result);
    });
    // my enrolled class
    app.get("/myEnrolledClasses/:email", async (req, res) => {
      const email = req.params.email;
      const query = { $and: [{ email: email }, { isEnrolled: 1 }] };
      const options = {
        projection: {
          _id: 1,
          classImage: 1,
          className: 1,
          price: 1,
          classId: 1,
        },
      };
      const result = await cartCollection.find(query, options).toArray();

      res.send(result);
    });

    //deleted selected classes
    app.delete("/deleteSelectedClasses/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment
    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payment related api
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      res.send(insertResult);

      // const query = {
      //   _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      // };
      // const deleteResult = await cartCollection.deleteMany(query);

      // res.send({ insertResult, deleteResult });
    });

    //update enrollment status
    app.patch("/classes/enrollment/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const newInfo = {
        $set: {
          isEnrolled: 1,
        },
      };
      const result = await cartCollection.updateOne(filter, newInfo);
      console.log(result);
      res.send(result);
    });

    // updated available seats
    app.patch("/updateAvailableSeats/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await classesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { availableSeats: -1 } }
        );

        if (result.matchedCount === 1) {
          res.status(200).send("Class updated successfully");
        } else {
          res.status(404).send("Class not found");
        }
      } catch (err) {
        console.error(err);
        res.status(500).send("Failed to update class");
      }
    });

    //payment history
    app.get("/paymenthistory/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const options = {
        projection: {
          _id: 1,
          className: 1,
          price: 1,
          transactionId: 1,
          date: 1,
          status: 1,
        },
      };
      const result = await paymentCollection.find(query, options).toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Summer camp is running...");
});

app.listen(port, () => {
  console.log(`Summer camp is sitting on port ${port}`);
});
