const Hapi = require('@hapi/hapi');
const WebSocket = require('ws');
const { MongoClient, ObjectId } = require('mongodb');

// MongoDB URI and Database Name
const uri = "mongodb+srv://chanduaadi2002:1BLKhFCyYyVp9D9J@myexperimentspart01.udu5e.mongodb.net/";
const client = new MongoClient(uri);
let db;

// Connect to MongoDB and initialize database
async function connectDB() {
  await client.connect();
  db = client.db('chatApp'); // Database name
  console.log('Connected to MongoDB');
}

// Store active WebSocket connections
let connections = {};

const startServer = async () => {
  const server = Hapi.server({
    port: 8080,
    host: 'localhost',
    routes: {
        cors: {
            origin: ['*'],
            headers: ['Access-Control-Allow-Headers', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Methods', 'Content-Type', 'Authorization']
        }
    }
  });

  // User registration
  server.route({
    method: 'POST',
    path: '/register',
    handler: async (request, h) => {
      const { userId, password, name } = request.payload;

      const existingUser = await db.collection('users').findOne({ userId });
      if (existingUser) {
        return { success: false, message: 'Username already exists' };
      }

      const newUser = {
        userId,
        password,
        name
      };

      await db.collection('users').insertOne(newUser);
      return { success: true, user: newUser };
    },
  });

  // User login
  server.route({
    method: 'POST',
    path: '/login',
    handler: async (request, h) => {
      const { userId, password } = request.payload;

      const user = await db.collection('users').findOne({ userId, password });
      if (user) {
        return { success: true, user };
      } else {
        return { success: false, message: 'Invalid credentials' };
      }
    },
  });

  // Fetch all users
  server.route({
    method: 'GET',
    path: '/users',
    handler: async (request, h) => {
      const users = await db.collection('users').find().toArray();
      return users;
    },
  });


 // Fetch all Msg's between sender and receiver, sorted by timeStamp
server.route({
  method: 'GET',
  path: '/get-user-messages',
  handler: async (request, h) => {
    const { senderId, receiverId } = request.query; // Get senderId and receiverId from query parameters
    
    try {
      const messages = await db.collection('messages').find({
        $or: [
          { senderId: senderId, receiverId: receiverId },
          { senderId: receiverId, receiverId: senderId }
        ]
      })
      .sort({ messageCreationTime: 1 }) // Sort by timeStamp in ascending order (oldest to newest)
      .toArray();
      
      return messages;
    } catch (error) {
      return h.response({ error: 'Error fetching messages' }).code(500);
    }
  },
});


  await server.start();
  console.log('Hapi server running on', server.info.uri);

  // Set up WebSocket server
  const wss = new WebSocket.Server({ noServer: true });

  wss.on('connection', (ws, request) => {
    let userId; // Declare userId variable
  
    // Handle incoming messages
    ws.on('message', async (message) => {
      const parsedMessage = JSON.parse(message);
      console.log('1');
      
      // Check for the connection message
      if (parsedMessage.type === 'connect') {
        userId = parsedMessage.userId; // Set userId from the message
        connections[userId] = ws; // Store the connection with userId as the key
        console.log(`New WebSocket connection established for userId: ${userId}`);
      } else if(parsedMessage.type === 'message') {
        const { senderId, receiverId, text } = parsedMessage;
  
        // Save chat message to MongoDB
        const chatMessage = {
          senderId,
          receiverId,
          text,
          messageCreationTime: new Date(),
        };
  
        await db.collection('messages').insertOne(chatMessage);
        console.log("chatMessage",chatMessage);
        
        // Broadcast the message to the recipient
        const recipient = connections[receiverId];
        if (recipient && recipient.readyState === WebSocket.OPEN) {
          recipient.send(JSON.stringify({...chatMessage,type:'message'}));
        }
      }
    });
  
    ws.on('close', () => {
      console.log(`WebSocket connection closed for userId: ${userId}`);
      if (userId) {
        delete connections[userId]; // Remove the connection when closed
      }
    });
  });
  

  // Handle WebSocket upgrade
  server.listener.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  await connectDB(); // Connect to MongoDB
};

startServer();
