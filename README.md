# دار المناجاة — منظومة الإدارة (الإصدار 5)

**React 18 + Vite + Tailwind CSS + Firebase + Node.js (Cloud Functions)**
مشروع مقسّم إلى وحدات مستقلة: كل وحدة في مجلد خاص، تُعدَّل دون أن تؤثر على غيرها.

---

## 1) البنية

```
dar-almunajat/
├── web/                         ← تطبيق الويب (يعمل كتطبيق جوال PWA وعلى الكمبيوتر)
│   ├── src/
│   │   ├── config/              ← إعدادات المنظومة (مصدر واحد لكل شيء)
│   │   │   ├── constants.js     ← أسماء المجموعات والحالات ونصوصها العربية
│   │   │   ├── roles.js         ← الأدوار الخمسة
│   │   │   ├── permissions.js   ← مصفوفة الصلاحيات can(role, 'permission')
│   │   │   ├── services.js      ← سجل الوحدات: المسار والأيقونة والأدوار والمجموعة
│   │   │   └── quran.js         ← السور الـ114 والتحقق من نطاق الآيات
│   │   ├── lib/
│   │   │   ├── backend.js       ← تهيئة Firebase أو الوضع التجريبي
│   │   │   ├── db/              ← طبقة البيانات: Firestore + نسخة بالذاكرة بنفس الواجهة
│   │   │   └── format.js        ← التواريخ والأعمار ورسائل الأخطاء بالعربية
│   │   ├── services/            ← منطق الأعمال لكل مجال (لا واجهات هنا)
│   │   │   ├── admissions.js    ← الطلب ← المراجعة ← المقابلة ← القرار
│   │   │   ├── academic.js      ← الحضور، حضور العاملين، التسميع، السلوك، الامتحانات
│   │   │   ├── comms.js         ← الإعلانات، التعميمات، الإشعارات، الشهادات، المسابقات
│   │   │   ├── people.js        ← الطلبة، الحلقات، المحفظون، الإعدادات
│   │   │   └── scope.js         ← تقييد الاستعلامات حسب الدور (مطابق لقواعد الأمان)
│   │   ├── context/             ← تسجيل الدخول + البيانات الحية المشتركة
│   │   ├── components/          ← مكتبة الواجهة (أزرار، بطاقات، نوافذ…) والهيكل العام
│   │   └── features/            ← الوحدات: كل وحدة مجلد مستقل
│   │       ├── admissions/  attendance/  behavior/  comms/  dashboard/
│   │       ├── exams/  hifz/  hub/  recognition/  settings/  students/  auth/
│   └── .env                     ← إعدادات مشروع Firebase (almongy-da32a)
├── functions/                   ← Node.js
│   ├── index.js                 ← Cloud Function: approveApplication
│   ├── lib/approval.js          ← اعتماد القبول بمعاملة واحدة على الخادم
│   ├── scripts/                 ← سكربتات إدارية تُشغَّل من جهازك
│   │   ├── create-user.mjs      ← إنشاء مدير / مشرف / محفظ
│   │   └── seed-base.mjs        ← إنشاء الحلقات والمحفظين والإعدادات
│   └── test/
├── firestore.rules              ← قواعد الأمان
├── firestore.indexes.json
└── firebase.json                ← النشر والمحاكيات
```

**قاعدة التقسيم:** الواجهة (`features/`) لا تتعامل مع Firebase مباشرة؛ تستدعي `services/`، والخدمات تستدعي `db()`. لذلك يمكن تغيير شكل شاشة دون لمس المنطق، وتغيير المنطق دون لمس الشاشات، واختبار المنطق كاملًا دون إنترنت.

---

## 2) التشغيل لأول مرة

المتطلبات: Node.js 20 أو أحدث.

```bash
npm run setup          # تثبيت الحزم (web + functions)
npm run dev:demo       # تشغيل تجريبي ببيانات وهمية على جهازك — بدون Firebase
npm run dev            # تشغيل متصل بمشروع almongy-da32a
```
افتح `http://localhost:5173`.

## 3) تجهيز Firebase (مرة واحدة)

1. **Firestore:** من [Console](https://console.firebase.google.com/project/almongy-da32a/firestore) ← Create database ← `europe-west1` ← Production mode.
   (مشروعك مفعّل فيه Realtime Database، وهي خدمة مختلفة لا يستخدمها التطبيق.)
2. **Authentication:** Sign-in method ← Email/Password ← Enable.
3. **أداة Firebase:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore,storage   # يرفع قواعد الأمان والفهارس وقواعد الملفات
   ```
4. **مفتاح حساب الخدمة** (لسكربتات الإدارة فقط — لا ترفعه أبدًا لأي مكان):
   Project settings ← Service accounts ← Generate new private key، ثم:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=~/keys/dar-admin.json     # Windows: set GOOGLE_APPLICATION_CREDENTIALS=...
   cd functions
   npm run seed                                                       # الحلقات والمحفظون والإعدادات
   npm run create-user -- --role admin --email you@example.com --password "كلمة-قوية" --name "اسم المدير"
   npm run create-user -- --role teacher --email t1@example.com --password "…" --name "الشيخ سعد" --teacher-id T1
   ```
5. **النشر:**
   ```bash
   npm run deploy          # يبني التطبيق ويرفعه مع القواعد → https://almongy-da32a.web.app
   ```

### Cloud Functions (اختياري)
تتطلب خطة **Blaze** (الدفع حسب الاستخدام؛ للاستخدام الصغير تكون غالبًا ضمن الحصة المجانية).
بدونها يعمل القبول من التطبيق نفسه محميًا بقواعد الأمان. معها يصبح القبول على الخادم، وفوائد ذلك:
- التحقق من أن المستخدم مدير يتم على الخادم.
- فحص سعة الحلقة يتم داخل معاملة، فلا يستطيع مديران ملء الحلقة فوق سعتها في نفس اللحظة.
- إن فشلت العملية يُحذف حساب ولي الأمر الذي أُنشئ لها.

```bash
firebase deploy --only functions
# ثم في web/.env:  VITE_USE_FUNCTIONS=true   وأعد النشر
```

---

## 4) إضافة وحدة جديدة (مثال: الخزينة)

1. **الخدمة:** `web/src/services/finance.js` — دوال تستخدم `db()` وتأخذ `actor`.
2. **الشاشة:** `web/src/features/finance/FinancePage.jsx` — تستخدم مكونات `@/components/ui`.
3. **التسجيل:** في `config/services.js` احذف `ready: false` من عنصر `finance`.
4. **المسار:** سطر واحد في `App.jsx`.
5. **الأمان:** أضف/راجع قاعدة المجموعة في `firestore.rules`.

القائمة الجانبية وشاشة "كل الخدمات" وحماية الصلاحيات تتحدث تلقائيًا من السجل.

## 5) حالة الوحدات

| مكتملة ومرتبطة بقاعدة البيانات | في المرحلة القادمة (تظهر صفحة "قريبًا") |
|---|---|
| الدخول، طلب الالتحاق العام، الطلبات ودورة القرار، لوحات الأدوار، الطلبة وملف الطالب، حضور الطلبة، حضور العاملين، التسميع، السلوك، الامتحانات، الإعلانات، التعميمات، الإشعارات، الشهادات، المسابقات، الإعدادات، **التسميع الثلاثي (جديد/قريب/بعيد) بواجب يقرره المحفظ من قوائم المصحف، خريطة الحفظ وخطة الطالب، النقاط ولوحة الشرف ومتجر الجوائز، الأعذار بمرفقات وموافقة، بطاقات الحضور QR، تنبيه الغياب المتتالي، الاختبارات الدورية والامتحانات الرسمية بلجان ومعايير، الشهادات بأرقام تسلسلية والتحقق العام `/verify`** | الخزينة، المدفوعات، التقارير، الجدول، الرسائل |

## 6) الاختبارات

```bash
npm test               # منطق الأعمال (web) + دالة القبول (functions)
```
**قبل إدخال بيانات حقيقية،** اختبر قواعد الأمان بأحد طريقين:
- محاكي Firebase على جهازك: `firebase emulators:start` مع `VITE_USE_EMULATORS=true`.
- أو **Rules Playground** في Console. أمثلة:
  - ولي أمر يقرأ طالبًا ليس ابنه ← يُرفض.
  - مستخدم يغيّر `role` لنفسه ← يُرفض.
  - إنشاء طلب التحاق بدون تسجيل دخول بحالة `pending` ← مسموح، وبحالة `approved` ← يُرفض.

## 7) العمل بدون إنترنت
البيانات تُحفظ على الجهاز. عند انقطاع الاتصال تعمل الشاشات ويُسجَّل الحضور والتسميع، وتُرسل البيانات تلقائيًا عند عودة الاتصال.
