import React, { useState } from "react";
import "./ResultsTable.css";

const ResultsTable = ({ results }) => {
  const [selectedPhones, setSelectedPhones] = useState({});

  const handleSelect = (guestName, phone) => {
    setSelectedPhones({
      ...selectedPhones,
      [guestName]: phone,
    });
  };

  return (
    <div className="results-container">
      <h2>התאמות מוזמנים</h2>
      {results.map((guest, index) => (
        <div key={index} className="guest-card">
          <h3>{guest.guest}</h3>
          <p>ציון התאמה: <strong>{guest.best_score}</strong></p>

          <ul className="candidates-list">
            {guest.candidates.map((c, i) => (
              <li key={i} className="candidate-item">
                <span>
                  <strong>{c.name}</strong> 📞 {c.phone}
                </span>
                <button
                  className={`select-btn ${
                    selectedPhones[guest.guest] === c.phone ? "selected" : ""
                  }`}
                  onClick={() => handleSelect(guest.guest, c.phone)}
                >
                  {selectedPhones[guest.guest] === c.phone
                    ? "✅ נבחר"
                    : "בחר"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <pre className="debug-output">
        {/* כאן תראה את הבחירות (בשלב פיתוח) */}
        {JSON.stringify(selectedPhones, null, 2)}
      </pre>
    </div>
  );
};

export default ResultsTable;
