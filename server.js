const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

// --- CONFIGURATION ---
const PORT = 3000;
// ⚠️ ACTION REQUIRED: Update this string with the result of 'ls /dev/cu.usbmodem*'
const ARDUINO_PATH = '/dev/cu.usbmodem143101'; 

app.use(express.static('public'));

// --- SERIAL PORT SETUP ---
const port = new SerialPort({ 
    path: ARDUINO_PATH, 
    baudRate: 9600,
    autoOpen: false // We open manually to handle errors gracefully
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// Open the port
port.open((err) => {
    if (err) {
        return console.log('❌ PORT ERROR: ' + err.message + '\n👉 Check your Arduino connection and Port Name!');
    }
    console.log('✅ SERIAL CONNECTION ESTABLISHED');
});

// --- DATA PROCESSING ---
parser.on('data', (data) => {
    // Expected format from Arduino: "distance,light"
    const values = data.split(',');
    if (values.length >= 2) {
        const fhirData = {
            resourceType: "Observation",
            status: "final",
            code: { text: "Posture and Environment" },
            component: [
                { 
                    code: { text: "Distance" }, 
                    valueQuantity: { value: parseInt(values[0]), unit: "cm" } 
                },
                { 
                    code: { text: "Light" }, 
                    valueInteger: parseInt(values[1]) 
                }
            ]
        };
        io.emit('fhir-data', fhirData);
    }
});

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- ERROR HANDLING & START ---
io.on('connection', (socket) => {
    console.log('🖥️ Dashboard Client Connected');
});

http.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.log(`❌ ERROR: Port ${PORT} is busy.`);
        console.log(`👉 Run 'killall node' in your terminal and try again.`);
    }
});

http.listen(PORT, () => {
    console.log('\n--- SCRIPT STARTING ---');
    console.log(`✅ SERVER IS LIVE`);
    console.log(`👉 Go to http://localhost:${PORT}`);
    console.log('------------------------\n');
});