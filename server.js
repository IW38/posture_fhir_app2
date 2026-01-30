const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

// --- CONFIGURATION ---
const PORT = 3001;
// Remember to update this path based on your "ls /dev/cu.usbmodem*" terminal result
const ARDUINO_PATH = '/dev/cu.usbmodem145201'; 

let sessionObservations = [];
let rollingBaseline = 864; 
let violationStartTime = null;

app.use(express.static('public'));

// --- UPDATED LOGIC: LIGHT-DRIVEN DISTANCE & STATES ---
function processPostureLogic(light) {
    // 1. VIRTUAL DISTANCE CALCULATION
    // Maps light (0-1023) to a virtual distance (0-60cm).
    // Formula: (light / max_light) * max_dist. As light drops, distance drops.
    let virtualDist = Math.round((light / 1024) * 60);

    let status = "Healthy State";
    let isViolation = false;

    // 2. PRIMARY STATE: Healthy vs Poor (500 Threshold)
    if (light < 500) {
        status = "Poor Posture Condition";
        
        // 3. TRUE POSTURAL VIOLATION: 30% below baseline for 10 seconds
        const violationThreshold = rollingBaseline * 0.7;
        if (light < violationThreshold) {
            if (!violationStartTime) {
                violationStartTime = Date.now();
            } else if (Date.now() - violationStartTime >= 10000) {
                isViolation = true;
                status = "TRUE POSTURAL VIOLATION";
            }
        } else {
            violationStartTime = null;
        }
    } else {
        status = "Healthy State";
        violationStartTime = null;
        // Slowly adapt baseline to current environment when in healthy state
        rollingBaseline = (rollingBaseline * 0.95) + (light * 0.05); 
    }

    // 4. WARNING STATE: Distance-based (derived from light)
    // If the virtual distance calculated from light falls below 23cm
    if (virtualDist < 23) {
        // Only override to Warning if we aren't already in a Critical Violation
        if (status !== "TRUE POSTURAL VIOLATION") {
            status = "Warning State: Too Close";
        }
    }

    // Calculate score for FHIR 
    let score = (light > 500) ? 100 : (isViolation) ? 20 : 60;
    
    return { status, score, virtualDist };
}

// --- SERIAL PORT SETUP ---
const port = new SerialPort({ 
    path: ARDUINO_PATH, 
    baudRate: 9600,
    autoOpen: false 
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

port.open((err) => {
    if (err) {
        console.log('\n❌ PORT ERROR: ' + err.message);
        console.log('💡 TIP: Run "ls /dev/cu.usbmodem*" in terminal for the right port name.\n');
    } else {
        console.log('\n✅ SERIAL CONNECTION ESTABLISHED');
    }
});

// --- DATA PROCESSING ---
parser.on('data', (rawLine) => {
    const cleanLine = rawLine.trim();
    if (!cleanLine) return;

    const values = cleanLine.split(',');
    
    if (values.length >= 2) {
        // We ignore values[0] (the physical sensor) and use values[1] (light)
        const light = parseInt(values[1]);
        
        if (isNaN(light)) return;

        // Process logic using the Light sensor as the source for everything
        const { status, score, virtualDist } = processPostureLogic(light);

        // CREATE FHIR RESOURCE 
        const fhirData = {
            resourceType: "Observation",
            id: `posture-${Date.now()}`,
            status: "final",
            statusText: status, 
            effectiveDateTime: new Date().toISOString(),
            code: { text: "Posture Monitoring" },
            valueInteger: score, 
            component: [
                { 
                    code: { text: "Distance" }, 
                    // Now displaying the Light-Derived Virtual Distance
                    valueQuantity: { value: virtualDist, unit: "cm" } 
                },
                { 
                    code: { text: "Light" }, 
                    valueInteger: light 
                }
            ]
        };

        sessionObservations.push(fhirData);
        if (sessionObservations.length > 200) sessionObservations.shift();
        
        io.emit('fhir-data', fhirData);
        console.log(`📡 [${status}] Virtual Dist: ${virtualDist}cm, Light: ${light}, Score: ${score}%`);
    }
});

// --- ROUTES ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/export-fhir', (req, res) => {
    const bundle = {
        resourceType: "Bundle",
        type: "collection",
        timestamp: new Date().toISOString(),
        entry: sessionObservations.map(obs => ({ resource: obs }))
    };
    res.json(bundle);
});

io.on('connection', (socket) => {
    console.log('🖥️ Dashboard Client Connected');
});

http.listen(PORT, () => {
    console.log(`\n🚀 SERVER LIVE: http://localhost:${PORT}`);
    console.log(`📡 Monitoring Hardware (Light Only) on: ${ARDUINO_PATH}\n`);
});