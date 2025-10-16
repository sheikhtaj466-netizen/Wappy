const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const port = process.env.PORT || 3000;

// --- Yahan apni Brevo ki details daalein jo 100% kaam karegi ---
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    auth: {
        user: 'sheikhtaj466@gmail.com', // <<-- Brevo wala login email
        pass: 'xsmtpsib-1b568cc3c4652ca11a9aed7cb3b6d350194dda26f76ec1764b850e776b4c975d-USNGyK3sbz1RCVkD'              // <<-- Brevo wali SMTP Key
    }
});

app.use(cors());
app.use(bodyParser.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const otpStore = {};
const users = {};
const chatHistory = {};

app.post('/send-otp', async (req, res) => {
    console.log(`'/send-otp' endpoint par request aayi! Email: ${req.body.email}`);
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, timestamp: Date.now() };
    console.log(`OTP for ${email}: ${otp}`);

    const mailOptions = {
        from: 'YOUR_BREVO_LOGIN_EMAIL@gmail.com', // Brevo wala login email
        to: email,
        subject: 'Your Wappy Login OTP',
        html: `Aapka Wappy OTP hai: <strong>${otp}</strong>`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("Email Brevo se successfully bheja gaya " + email);
        res.status(200).json({ message: 'OTP sent.' });
    } catch (error) {
        console.error("--- EMAIL BHEJNE ME ERROR AAYA ---");
        console.error(JSON.stringify(error, null, 2));
        console.error("--- ERROR END ---");
        res.status(500).json({ message: 'Failed to send OTP.' });
    }
});

// Baaki ka poora code bilkul waisa hi rahega...
app.post('/verify-otp', (req, res) => { const { email, otp } = req.body; if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' }); const stored = otpStore[email]; if (!stored || otp !== stored.otp || (Date.now() - stored.timestamp > 300000)) { return res.status(400).json({ message: 'Invalid or expired OTP.' }); } delete otpStore[email]; if (!users[email]) { users[email] = { online: false, lastMessage: '', timestamp: '' }; } res.status(200).json({ message: 'Login successful!', user: { email } }); });
app.get('/api/users', (req, res) => { const allUsers = Object.keys(users).map(email => ({ email, online: users[email].online || false, lastMessage: users[email].lastMessage || 'No messages yet.', timestamp: users[email].timestamp || '' })); res.json(allUsers); });
app.get('/api/chat-history/:user1/:user2', (req, res) => { const { user1, user2 } = req.params; const roomKey = [user1, user2].sort().join('-'); res.json(chatHistory[roomKey] || []); });
io.on('connection', (socket) => { console.log('Ek naya user connect hua: ' + socket.id); socket.on('register', (email) => { if(!users[email]) { users[email] = {}; } users[email].socketId = socket.id; users[email].online = true; socket.email = email; io.emit('user status changed', { email, online: true, lastMessage: users[email].lastMessage, timestamp: users[email].timestamp }); }); socket.on('private message', ({ to, message }) => { const recipient = users[to]; const sender = users[socket.email]; const roomKey = [to, socket.email].sort().join('-'); if (!chatHistory[roomKey]) { chatHistory[roomKey] = []; } const messageData = { from: socket.email, message: message, time: new Date() }; chatHistory[roomKey].push(messageData); const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); sender.lastMessage = message; sender.timestamp = timestamp; recipient.lastMessage = message; recipient.timestamp = timestamp; if (recipient && recipient.online) { io.to(recipient.socketId).emit('private message', messageData); } io.emit('user status changed', { email: to, online: recipient.online, lastMessage: message, timestamp }); io.emit('user status changed', { email: socket.email, online: sender.online, lastMessage: message, timestamp }); }); socket.on('disconnect', () => { if (socket.email && users[socket.email]) { users[socket.email].online = false; io.emit('user status changed', { email: socket.email, online: false, lastMessage: users[socket.email].lastMessage, timestamp: users[socket.email].timestamp }); } }); });
server.listen(port, () => { console.log(`🚀 Server ready at http://localhost:${port}`); });
