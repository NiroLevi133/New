from logic import load_excel, top_matches

import pandas as pd

# טען את אנשי הקשר
contacts_df = load_excel("contacts_file.xlsx")  # תשנה לשם הקובץ האמיתי שלך

# בדוק מוזמן ספציפי
print(top_matches("ניר לוי", contacts_df))
