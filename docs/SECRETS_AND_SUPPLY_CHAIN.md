# Secret Rotation و زنجیره تأمین

## دروازه وابستگی

CI برای API و Web، `npm audit --omit=dev --audit-level=high` را اجرا می‌کند؛ High/Critical در dependencyهای production مانع build است. audit کامل نیز Criticalهای ابزار توسعه را مسدود می‌کند. lockfile نسخه ۳، integrity تمام tarballها، License هر package و نبود الگوهای شناخته‌شده secret در فایل‌های tracked توسط `scripts/phase8-supply-chain.mjs` کنترل می‌شود.

برای هر run، اسکریپت policy مستقیماً از lockfileهای قطعی دو SBOM با فرمت CycloneDX و inventory مجوزها می‌سازد و آن‌ها را در artifact به نام `supply-chain-reports` ذخیره می‌کند. LGPL مربوط به binaryهای جداگانه libvips و MPL مربوط به ابزارهای `axe-core` و `lightningcss` است؛ توزیع production باید notice و متن مجوزهای لازم را همراه خود نگه دارد. استثناهای فاقد metadata lockfile فقط با نام و نسخه دقیق در `dependency-license-exceptions.json` پذیرفته می‌شوند.

## موجودی Secret و دوره چرخش

| Secret | دوره عادی | اثر چرخش |
| --- | ---: | --- |
| `JWT_ACCESS_SECRET` | هر ۹۰ روز | access tokenهای قبلی حداکثر تا TTL پانزده‌دقیقه‌ای نامعتبر می‌شوند. |
| `DOWNLOAD_TOKEN_SECRET` | هر ۹۰ روز | Signed URLهای قبلی حداکثر پنج دقیقه اعتبار دارند و یک‌بارمصرف‌اند. |
| `OBSERVABILITY_TOKEN` | هر ۹۰ روز | collector/monitor باید هم‌زمان به مقدار جدید تغییر کند. |
| credentialهای DB، Payment، SMS، Email، Antivirus و Storage | طبق provider، حداکثر ۹۰ روز | ابتدا credential جدید ساخته، اتصال آزموده و سپس قبلی revoke شود. |
| `BACKUP_ENCRYPTION_KEY` | سالانه یا پس از رخداد | `BACKUP_KEY_ID` جدید فعال شود؛ کلید قدیمی تا پایان Retention backupهای وابسته نگه‌داری شود. |

Secretها فقط در secret manager محیط استقرار قرار می‌گیرند، نه `.env` ثبت‌شده، Docker image، CI artifact، ticket یا log. مالک rotation باید تاریخ، شناسه secret، محیط، نتیجه health/smoke و زمان revoke را بدون ثبت مقدار secret در Audit عملیاتی نگه دارد.

## رویه عادی

1. credential یا کلید جدید با entropy کافی در secret manager ساخته و با شناسه نسخه ثبت شود.
2. Backup و rollback آماده، سپس وابستگی مصرف‌کننده مانند provider یا monitor با مقدار جدید آزمایش شود.
3. برای JWT و Download، deploy در پنجره نگه‌داری انجام شود. Sessionهای refresh opaque باقی می‌مانند؛ کاربر در اولین refresh access token جدید می‌گیرد. اگر logout کوتاه قابل قبول نیست، چرخش تا پایان TTL پانزده‌دقیقه‌ای access token و پنج‌دقیقه‌ای download URL مرحله‌بندی شود.
4. `/ready`، ورود/refresh، دانلود یک‌بارمصرف و adapter مربوط smoke شوند.
5. پس از پنجره overlap، credential قبلی در provider/secret manager revoke و نتیجه ثبت شود.

## رخداد و چرخش اضطراری

در افشای احتمالی منتظر دوره عادی نمانید: سرویس write به maintenance برود، تمام Sessionها revoke شوند، JWT و Download secret فوراً عوض و deploy شوند، credentialهای provider از سمت provider باطل شوند و دسترسی log/artifact بررسی شود. برای کلید Backup، دسترسی storage و کلید هر دو rotate و یک Backup تازه با restore test تهیه شود. پس از بازیابی، timeline، دامنه افشا، کاربران متاثر و اقدامات تکمیلی در گزارش Incident ثبت شوند.

Rollback هرگز به secret افشاشده انجام نمی‌شود. اگر deploy جدید مشکل داشت، کد قبلی با secret جدید بازگردانده می‌شود. فایل‌های نمونه فقط placeholder دارند و validation production حداقل طول و متفاوت‌بودن کلیدهای حساس را enforce می‌کند.
