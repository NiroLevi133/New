import React, { useState } from "react";
import UploadForm from "./UploadForm";
import "./AuthScreen.css";

const AuthScreen = () => {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1); // 1 = הכנסת טלפון, 2 = הכנסת קוד, 3 = עבר אימות
  const [error, setError] = useState("");

  const handleSendCode = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8001/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (res.ok) {
        setStep(2); // עבר לשלב של הכנסת קוד
        setError("");
      } else {
        setError("שגיאה בשליחת הקוד");
      }
    } catch (err) {
      setError("שגיאת רשת");
    }
  };

  const handleVerifyCode = async () => {
    try {
      const res = await fetch("https://new-569016630628.europe-west1.run.app/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (data.verified) {
        setStep(3); // אימות עבר ✅
        setError("");
      } else {
        setError("קוד שגוי");
      }
    } catch (err) {
      setError("שגיאת רשת");
    }
  };

  if (step === 3) {
    // אחרי אימות → עובר למסך הבא
    return <UploadForm />;
  }

  return (
    <div className="screen-container auth-screen">
      <h2>🔒 אימות משתמש</h2>

      {step === 1 && (
        <>
          <input
            type="text"
            placeholder="הכנס מספר טלפון"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-field"
          />
          <button className="btn btn-primary" onClick={handleSendCode}>
            שלח קוד
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <input
            type="text"
            placeholder="הכנס קוד"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input-field"
          />
          <button className="btn btn-primary" onClick={handleVerifyCode}>
            אמת קוד
          </button>
        </>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
};

export default AuthScreen;
