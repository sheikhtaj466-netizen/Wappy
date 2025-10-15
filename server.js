const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors'); // CORS middleware ko import karein

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Sabhi connections ko allow karein
        methods: ["GET", "POST"]
    }
});
const port = process.env.PORT || 3000; // Render ke liye zaroori

// --- Middleware ---
app.use(cors()); // CORS ko enable karein
app.use(bodyParser.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const otpStore = {};
const users = {}; 
const chatHistory = {};

// --- Nodemailer Transport ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: 'YOUR_EMAIL@gmail.com', pass: 'YOUR_APP_PASSWORD' } // Apna email/password daalein
});

// --- API Endpoints ---
app.post('/send-otp', (req, res) => {
    // --- NAYI LOGGING LINE ---
    console.log("'/send-otp' endpoint par request aayi!"); 

    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, timestamp: Date.now() };
    console.log(`OTP for ${email}: ${otp}`);
    
    const mailOptions = { from: '"Wappy App" <YOUR_EMAIL@gmail.com>', to: email, subject: 'Your Wappy Login OTP', html: `Your OTP is: <b>${otp}</b>` };
    transporter.sendMail(mailOptions, (error) => {
        if (error) {
            console.error("Email bhejne me error:", error);
            return res.status(500).json({ message: 'Failed to send OTP.' });
        }
        console.log("Email successfully bheja gaya " + email);
        res.status(200).json({ message: 'OTP sent.' });
    });
});

app.post('/verify-otp', (req, res) => { /* Ismein koi badlaav nahi */ 
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });
    const stored = otpStore[email];
    if (!stored || otp !== stored.otp || (Date.now() - stored.timestamp > 300000)) {
        return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }
    delete otpStore[email];
    if (!users[email]) {
        users[email] = { online: false, lastMessage: '', timestamp: '' };
    }
    res.status(200).json({ message: 'Login successful!', user: { email } });
});

app.get('/api/users', (req, res) => { /* Ismein koi badlaav nahi */ 
    const allUsers = Object.keys(users).map(email => ({
        email,
        online: users[email].online || false,
        lastMessage: users[email].lastMessage || 'No messages yet.',
        timestamp: users[email].timestamp || ''
    }));
    res.json(allUsers);
});

app.get('/api/chat-history/:user1/:user2', (req, res) => { /* Ismein koi badlaav nahi */ 
    const { user1, user2 } = req.params;
    const roomKey = [user1, user2].sort().join('-');
    res.json(chatHistory[roomKey] || []);
});


// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('Ek naya user connect hua: ' + socket.id);
    /* Baaki Socket code me koi badlaav nahi */
    socket.on('register', (email) => { users[email].socketId = socket.id; users[email].online = true; socket.email = email; io.emit('user status changed', { email, online: true, lastMessage: users[email].lastMessage, timestamp: users[email].timestamp }); });
    socket.on('private message', ({ to, message }) => { const recipient = users[to]; const sender = users[socket.email]; const roomKey = [to, socket.email].sort().join('-'); if (!chatHistory[roomKey]) { chatHistory[roomKey] = []; } const messageData = { from: socket.email, message: message, time: new Date() }; chatHistory[roomKey].push(messageData); const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); sender.lastMessage = message; sender.timestamp = timestamp; recipient.lastMessage = message; recipient.timestamp = timestamp; if (recipient && recipient.online) { io.to(recipient.socketId).emit('private message', messageData); } io.emit('user status changed', { email: to, online: recipient.online, lastMessage: message, timestamp }); io.emit('user status changed', { email: socket.email, online: sender.online, lastMessage: message, timestamp }); });
    socket.on('disconnect', () => { if (socket.email && users[socket.email]) { users[socket.email].online = false; io.emit('user status changed', { email: socket.email, online: false, lastMessage: users[socket.email].lastMessage, timestamp: users[socket.email].timestamp }); } });
});


server.listen(port, () => {
    console.log(`🚀 Server ready at http://localhost:${port}`);
});
