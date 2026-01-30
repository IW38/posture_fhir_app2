/*
 * Posture Pro - Optimized for State-Based Server
 */

const int trigPin = 9;    
const int echoPin = 10;   
const int lightPin = A0;  

// Timeout for the distance sensor (30000 microseconds = ~5 meters max)
// This prevents the code from lagging if no object is detected.
const unsigned long echoTimeout = 30000; 

void setup() {
  Serial.begin(9600); 
  pinMode(trigPin, OUTPUT);
  pinMode(echoPin, INPUT);
  pinMode(lightPin, INPUT);
  
  // Ensure trigger is low to start
  digitalWrite(trigPin, LOW);
}

void loop() {
  long duration;
  int distance;
  
  // --- DISTANCE MEASUREMENT ---
  // Clean pulse start
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  // Read duration with a timeout to keep the loop fast
  duration = pulseIn(echoPin, HIGH, echoTimeout);
  
  // Calculate distance: 0 indicates no reading or out of range
  if (duration == 0) {
    distance = 0; 
  } else {
    distance = duration * 0.034 / 2;
  }

  // --- LIGHT MEASUREMENT ---
  int lightValue = analogRead(lightPin);

  // --- CSV OUTPUT ---
  // Sending: distance,lightValue
  Serial.print(distance);
  Serial.print(",");
  Serial.println(lightValue);

  // 500ms delay matches the server's expectation for high-frequency monitoring
  delay(500);
}