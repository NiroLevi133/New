import React from 'react';

/* * הקובץ הזה רוקן מתוכן כדי למנוע הצגה כפולה של כפתורי ניווט (הכפתורים העליונים).
 * לוגיקת הניווט העדכנית נמצאת כעת בקובץ ChatunoTech.jsx.
 */
const GuestWizard = ({ results }) => {
  if (results) {
    return (
      <div style={{display: 'none'}}></div>
    );
  }
  return <div></div>;
};

export default GuestWizard;