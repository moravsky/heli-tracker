// Mini tracker row controller
// Serial protocol (115200, newline-terminated):
//   A <deg>   -> move to angle (e.g. "A 45", "A -30")
//   Z         -> zero current position
//   S         -> stop
// Telemetry every 200 ms: "T <angleDeg> <panelVolts>"

#include <Stepper.h>

const int STEPS_PER_REV = 2048;          // 28BYJ-48 via Stepper lib (full-step)
const int PINS[4] = {8, 9, 10, 11};       // IN1..IN4
Stepper stepper(STEPS_PER_REV, 8, 10, 9, 11);  // pin order required by this motor

const int PANEL_PIN = A0;
long currentSteps = 0;
long targetSteps  = 0;
unsigned long lastReport = 0;

long angleToSteps(float deg) { return lround(deg / 360.0 * STEPS_PER_REV); }
float stepsToAngle(long s)   { return s * 360.0 / STEPS_PER_REV; }

void coilsOff() { for (int i = 0; i < 4; i++) digitalWrite(PINS[i], LOW); }

void setup() {
  Serial.begin(115200);
  Serial.setTimeout(50);
  stepper.setSpeed(10);                   // rpm; 28BYJ-48 tops out ~12-15
  Serial.println("READY");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.startsWith("A")) {
      targetSteps = angleToSteps(line.substring(1).toFloat());
    } else if (line == "Z") {
      currentSteps = 0; targetSteps = 0;
    } else if (line == "S") {
      targetSteps = currentSteps;
    }
  }

  long diff = targetSteps - currentSteps;
  if (diff != 0) {
    int chunk = (int)min(8L, labs(diff));   // small chunks keep serial responsive
    int dir = diff > 0 ? 1 : -1;
    stepper.step(dir * chunk);
    currentSteps += dir * chunk;
    if (currentSteps == targetSteps) coilsOff();  // don't cook the motor while idle
  }

  if (millis() - lastReport >= 200) {
    lastReport = millis();
    float volts = analogRead(PANEL_PIN) * 5.0 / 1023.0;
    Serial.print("T ");
    Serial.print(stepsToAngle(currentSteps), 1);
    Serial.print(' ');
    Serial.println(volts, 3);
  }
}
