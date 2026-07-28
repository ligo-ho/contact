# אירוח אמיתי ומאובטח ב־Vercel

האפליקציה היא SPA ציבורית ללא backend. מזהי הלקוח של Google ושל Microsoft נשלחים לדפדפן ולכן **אינם סודות**. אין להכניס Client Secret לאפליקציה הזאת.

## 1. יצירת הפרויקט ב־Vercel

1. ב־Vercel בחרו **Add New → Project**.
2. ייבאו את הריפו `ligo-ho/contact`.
3. אין צורך לבחור Framework Preset מיוחד; `vercel.json` מגדיר את ה־build ואת תיקיית `dist`.
4. הוסיפו Environment Variables:

```text
GOOGLE_CLIENT_ID=<Google OAuth Web Client ID>
MICROSOFT_CLIENT_ID=<Microsoft Application Client ID>
MICROSOFT_TENANT=common
```

`MICROSOFT_TENANT` יכול להיות גם `consumers`, `organizations`, או Tenant ID ספציפי. לשימוש פרטי ומוגבל עדיף Tenant ID ספציפי ככל שניתן.

## 2. קביעת כתובת קבועה

לאחר הפריסה, עדיף לחבר דומיין קבוע ולא להסתמך על כתובות Preview משתנות. לדוגמה:

```text
https://contacts.example.com
```

ה־build נכשל בכוונה אם אחד ממזהי הלקוח חסר או אינו בפורמט הצפוי.

## 3. Google Cloud

ב־OAuth Client מסוג **Web application** הוסיפו תחת **Authorized JavaScript origins** את ה־origin בלבד:

```text
https://contacts.example.com
```

אין להוסיף נתיב בסוף ואין צורך ב־Client Secret בצד הדפדפן.

ב־OAuth consent screen השאירו רק את ה־scopes הנדרשים:

```text
openid
email
https://www.googleapis.com/auth/contacts
```

לשימוש מצומצם אפשר להשאיר את האפליקציה ב־Testing ולהוסיף משתמשי בדיקה. לפרסום רחב נדרש תהליך האימות של Google.

## 4. Microsoft Entra

ב־App Registration:

1. הוסיפו פלטפורמת **Single-page application (SPA)**.
2. הוסיפו Redirect URI מדויק:

```text
https://contacts.example.com/
```

3. השאירו Delegated permissions בלבד:

```text
User.Read
Contacts.ReadWrite
```

אין ליצור או להכניס Client Secret. MSAL משתמש ב־Authorization Code Flow עם PKCE עבור SPA.

## 5. מה נשמר בדפדפן

- טוקן Google נשמר בזיכרון JavaScript בלבד.
- MSAL מנהל את מטמון ההתחברות ב־`sessionStorage`, כולל חומר הדרוש לחידוש שקט במהלך הטאב הפעיל.
- הקוד מנקה את מטמון Microsoft בהתנתקות ובפקיעת חלון השימוש המקומי של שעה.
- אנשי הקשר עצמם אינם נשלחים לשרת של האפליקציה ואינם נשמרים בו.

לכן הניסוח המדויק הוא: **אין refresh token שנשמר בשרת או נשמר לטווח ארוך בידי האפליקציה**. אין לטעון ש־Microsoft לעולם אינו מנפיק refresh token פנימי ל־MSAL.

## 6. בדיקה לאחר פריסה

בדקו בדפדפן:

1. שהכתובת היא HTTPS.
2. שהתחברות Google ו־Microsoft עובדת רק מהדומיין הרשום.
3. שב־Network אנשי הקשר נשלחים רק ל־Google APIs או Microsoft Graph.
4. שב־Application → Session Storage נתוני MSAL נעלמים לאחר התנתקות.
5. שכותרות התגובה כוללות CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` ו־`Permissions-Policy`.

## מגבלה חשובה

אפליקציה שרצה בדפדפן חשופה עקרונית לסיכון XSS: אם קוד זדוני ירוץ באותו origin בזמן שהמשתמש מחובר, הוא עלול להשתמש בטוקן הפעיל. לכן הפריסה מקשיחה CSP, אינה מאפשרת סקריפטים לא מורשים, ואינה כוללת אנליטיקה או קוד צד שלישי שאינו נחוץ להתחברות.
