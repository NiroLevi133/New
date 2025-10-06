import React, { useState } from "react";
import GuestWizard from "./GuestWizard";

function UploadForm() {
  const [results, setResults] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("guests_file", e.target.guests_file.files[0]);
    formData.append("contacts_file", e.target.contacts_file.files[0]);

    try {
      const res = await fetch("http://127.0.0.1:8001/merge-files", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResults(data.results); // שומר את התוצאות
    } catch (err) {
      console.error("שגיאה:", err);
    }
  };

  return (
    <div>
      {!results ? (
        <form onSubmit={handleSubmit}>
          <h2>העלאת קבצים</h2>
          <input type="file" name="guests_file" required />
          <input type="file" name="contacts_file" required />
          <button type="submit">שלח</button>
        </form>
      ) : (
        <GuestWizard results={results} />
      )}
    </div>
  );
}

export default UploadForm;
