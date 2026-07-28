# הגדרה (Setup)

צריך לבצע שני רישומים חד‑פעמיים: אחד ב‑Google ואחד ב‑Microsoft, ולהעתיק שני
מזהי לקוח (Client IDs) לקובץ `config.js`. אין שום סוד (secret) — הכול רץ בדפדפן.

> **החליטו על כתובת (origin) אחת מראש.** לפיתוח מקומי: `http://localhost:8000`.
> לשימוש אמיתי: כתובת ה‑HTTPS שבה תארחו את הקבצים (למשל GitHub Pages).
> אותה כתובת בדיוק צריכה להירשם בשני המקומות למטה.

---

## 1. Google

### א. פרויקט + הפעלת People API
1. היכנסו ל‑<https://console.cloud.google.com/> וצרו פרויקט (או בחרו קיים).
2. **APIs & Services → Library** → חפשו **People API** → **Enable**.

### ב. מסך ההסכמה (OAuth consent screen)
1. **APIs & Services → OAuth consent screen**.
2. **User Type: External** → Create.
3. מלאו שם אפליקציה, אימייל תמיכה, ואימייל מפתח. (לוגו ותחום — לא חובה כרגע.)
4. **Scopes** → Add or remove scopes → הוסיפו **רק** את:
   - `.../auth/userinfo.email`
   - `.../auth/contacts`  ← זהו scope **רגיש (sensitive)**.
5. **Test users** → הוסיפו את כתובות ה‑Gmail של כל מי שישתמש (עד 100).
6. שמרו והשאירו את הסטטוס במצב **Testing**.

### ג. יצירת OAuth Client
1. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type: Web application**.
3. **Authorized JavaScript origins** → הוסיפו את הכתובת שבחרתם, למשל
   `http://localhost:8000` (ובנוסף כתובת ה‑HTTPS אם תארחו).
   *אין צורך ב‑redirect URI* עבור זרימת הטוקן הזו.
4. Create → העתיקו את ה‑**Client ID** (מסתיים ב‑`.apps.googleusercontent.com`).

### על האזהרה "Google hasn't verified this app"
ה‑scope של אנשי קשר הוא **רגיש**, ולכן:

- **מצב Testing + test users (מהיר, מומלץ למקרה שלכם):** כל משתמש שהוספתם
  יכול להתחבר מיד, ללא תהליך אימות. בהתחברות תופיע פעם אחת מסך
  *"Google hasn't verified this app"* → לוחצים **Advanced → Go to … (unsafe)**.
  זה בטוח לחלוטין כאן — זו האפליקציה שלכם, שרצה בדפדפן שלכם, ללא שרת. מתאים
  בדיוק לתרחיש של מעט משתמשים ידועים ושימוש חד‑פעמי.
- **הסרת האזהרה לגמרי ("לשמור על הכללים"):** יש להגיש את האפליקציה
  **לאימות (Verification)** ב‑OAuth consent screen — דורש מדיניות פרטיות
  פומבית, בעלות על דומיין, והצדקת ה‑scope. לוקח מספר ימים עד שבועות. נחוץ רק
  אם אתם רוצים אפס אזהרות או יותר מ‑100 משתמשים. ל‑`contacts` **לא** נדרש
  security assessment חיצוני (זה רק ל‑scopes "restricted" כמו Gmail/Drive).

---

## 2. Microsoft

1. היכנסו ל‑<https://portal.azure.com/> → **App registrations → New registration**.
2. **Name:** לבחירתכם.
3. **Supported account types:**
   *Accounts in any organizational directory and personal Microsoft accounts*
   (מאפשר חשבונות פרטיים של Outlook/Hotmail וגם חשבונות ארגוניים).
4. **Redirect URI:** בחרו פלטפורמה **Single-page application (SPA)** והזינו את
   אותה כתובת, למשל `http://localhost:8000`. (חשוב שזה יהיה מסוג **SPA** — כך
   מתאפשר PKCE ללא secret.) → **Register**.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**
   → הוסיפו **רק**:
   - `User.Read` (מובנה, לזיהוי החשבון המחובר)
   - `Contacts.ReadWrite`

   > **אל תוסיפו `offline_access`.** בלעדיו Microsoft לא מנפיקה refresh token —
   > בדיוק כפי שרצינו.

   שתי ההרשאות ניתנות לאישור על ידי המשתמש עצמו (user consent) — לא נדרש אישור
   מנהל (admin) עבור חשבונות פרטיים.
6. **Overview** → העתיקו את **Application (client) ID**.

### על אזהרות ב‑Microsoft
בניגוד ל‑Google, אין מסך "unsafe" מפחיד. המשתמש רואה מסך הסכמה רגיל שמפרט את
ההרשאות. אם תרצו להסיר את הכיתוב *"unverified"* אפשר לבצע **Publisher
Verification** (חינמי, דרך חשבון שותפים של Microsoft) — לא חובה לשימוש קטן.

---

## 3. חיבור להגדרות

```bash
cp config.example.js config.js
```

ערכו את `config.js` והדביקו את שני המזהים:

```js
window.APP_CONFIG = {
  google:    { clientId: '....apps.googleusercontent.com', scope: 'openid email https://www.googleapis.com/auth/contacts' },
  microsoft: { clientId: '........-....-....', authority: 'https://login.microsoftonline.com/common', scopes: ['User.Read', 'Contacts.ReadWrite'] },
};
```

`config.js` מוחרג ב‑`.gitignore` כדי לא לזלוג לריפו (המזהים אינם סודות, אבל כך
הריפו נשאר גנרי).

---

## 4. הרצה

**אפשרות א' — השרת המצורף (עם כותרות אבטחה אמיתיות, ללא תלויות):**
```bash
node server.js          # http://localhost:8000
# PORT=5173 node server.js   # פורט אחר
```

**אפשרות ב' — כל שרת סטטי אחר:**
```bash
python3 -m http.server 8000
```

פתחו את הכתובת שבחרתם, התחברו לשני החשבונות, בחרו כיוון, לחצו **תצוגה מקדימה**,
סמנו אילו אנשי קשר להעתיק, ולחצו **התחלת סנכרון**.

> אם ה‑origin שאתם פותחים בדפדפן שונה מזה שרשמתם ב‑Google/Microsoft, ההתחברות
> תיכשל. ודאו שהם זהים (כולל הפורט).

---

## 5. אירוח אמיתי (HTTPS)

לשימוש מעבר ל‑localhost צריך כתובת **HTTPS**. הכי פשוט: **GitHub Pages** —
העלו את הקבצים הסטטיים, ורשמו את כתובת ה‑Pages (למשל
`https://USER.github.io/contact/`) כ‑JavaScript origin ב‑Google וכ‑SPA redirect
URI ב‑Microsoft. (ב‑Pages אין כותרות אבטחה מותאמות, אך ה‑`<meta>` CSP שבתוך
`index.html` עדיין חל.)
