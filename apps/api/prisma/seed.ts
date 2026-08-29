import {
  LedgerAccountType,
  PrismaClient,
  UserRole,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Passw0rd!123';

function code(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function ensureSystemLedgerAccounts() {
  const types: LedgerAccountType[] = [
    LedgerAccountType.platform_escrow,
    LedgerAccountType.platform_commission,
    LedgerAccountType.payment_gateway_clearing,
  ];

  for (const accountType of types) {
    const existing = await prisma.ledgerAccount.findFirst({
      where: { accountType, ownerUserId: null },
    });
    if (!existing) {
      await prisma.ledgerAccount.create({ data: { accountType } });
      console.log(`ساخته شد: حساب سیستمی ${accountType}`);
    }
  }
}

async function ensureUserWithWallet(params: {
  phone: string;
  fullName: string;
  role: UserRole;
  adminScope?: 'super_admin' | 'ops_admin' | 'finance_admin';
}) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { phone: params.phone },
    create: {
      phone: params.phone,
      fullName: params.fullName,
      role: params.role,
      adminScope: params.adminScope,
      status: UserStatus.active,
      passwordHash,
    },
    update: {},
  });

  if (params.role === UserRole.customer || params.role === UserRole.executor) {
    const accountType =
      params.role === UserRole.executor
        ? LedgerAccountType.executor_wallet
        : LedgerAccountType.customer_wallet;
    await prisma.ledgerAccount.upsert({
      where: { ownerUserId: user.id },
      create: { ownerUserId: user.id, accountType },
      update: {},
    });
    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }

  return user;
}

async function main() {
  console.log('در حال seed کردن دیتابیس «نیازت با ما»...');

  await ensureSystemLedgerAccounts();

  // -----------------------------------------------------------------
  // ادمین‌ها
  // -----------------------------------------------------------------
  await ensureUserWithWallet({
    phone: '09120000001',
    fullName: 'مدیر کل سیستم',
    role: UserRole.admin,
    adminScope: 'super_admin',
  });
  await ensureUserWithWallet({
    phone: '09120000002',
    fullName: 'مدیر عملیات',
    role: UserRole.admin,
    adminScope: 'ops_admin',
  });
  await ensureUserWithWallet({
    phone: '09120000003',
    fullName: 'مدیر مالی',
    role: UserRole.admin,
    adminScope: 'finance_admin',
  });

  // -----------------------------------------------------------------
  // پشتیبان
  // -----------------------------------------------------------------
  await ensureUserWithWallet({
    phone: '09120000004',
    fullName: 'کارشناس پشتیبانی',
    role: UserRole.support,
  });

  // -----------------------------------------------------------------
  // تیم‌ها و کارمندان داخلی (executor)
  // -----------------------------------------------------------------
  const webTeam = await prisma.team.upsert({
    where: { code: 'WEB-02' },
    create: {
      code: 'WEB-02',
      name: 'تیم وب ۲',
      description: 'طراحی و توسعه سایت',
    },
    update: {},
  });
  const contentTeam = await prisma.team.upsert({
    where: { code: 'CNT-01' },
    create: {
      code: 'CNT-01',
      name: 'تیم محتوا و سئو',
      description: 'محتوا، سئو و پژوهش',
    },
    update: {},
  });

  const webDesignSkill = await prisma.skill.upsert({
    where: { name: 'طراحی رابط وب' },
    create: { name: 'طراحی رابط وب', category: 'طراحی و توسعه' },
    update: {},
  });
  const frontendSkill = await prisma.skill.upsert({
    where: { name: 'توسعه فرانت‌اند' },
    create: { name: 'توسعه فرانت‌اند', category: 'طراحی و توسعه' },
    update: {},
  });
  const contentSkill = await prisma.skill.upsert({
    where: { name: 'تولید محتوای سئو' },
    create: { name: 'تولید محتوای سئو', category: 'محتوا' },
    update: {},
  });

  const executor1User = await ensureUserWithWallet({
    phone: '09120000005',
    fullName: 'کارمند اجرای وب یک',
    role: UserRole.executor,
  });
  const executorProfile1 = await prisma.executorProfile.upsert({
    where: { userId: executor1User.id },
    create: {
      userId: executor1User.id,
      publicHandlerCode: 'OPS-108',
      displayAlias: 'کارشناس پیگیری ۱۰۸',
      teamId: webTeam.id,
      capacityPercent: 40,
    },
    update: {},
  });
  await prisma.executorSkill.upsert({
    where: {
      executorProfileId_skillId: {
        executorProfileId: executorProfile1.id,
        skillId: webDesignSkill.id,
      },
    },
    create: {
      executorProfileId: executorProfile1.id,
      skillId: webDesignSkill.id,
      level: 4,
    },
    update: {},
  });
  await prisma.executorSkill.upsert({
    where: {
      executorProfileId_skillId: {
        executorProfileId: executorProfile1.id,
        skillId: frontendSkill.id,
      },
    },
    create: {
      executorProfileId: executorProfile1.id,
      skillId: frontendSkill.id,
      level: 4,
    },
    update: {},
  });

  const executor2User = await ensureUserWithWallet({
    phone: '09120000006',
    fullName: 'کارمند محتوا یک',
    role: UserRole.executor,
  });
  const executorProfile2 = await prisma.executorProfile.upsert({
    where: { userId: executor2User.id },
    create: {
      userId: executor2User.id,
      publicHandlerCode: 'CNT-21',
      displayAlias: 'کارشناس پیگیری ۲۱',
      teamId: contentTeam.id,
      capacityPercent: 20,
    },
    update: {},
  });
  await prisma.executorSkill.upsert({
    where: {
      executorProfileId_skillId: {
        executorProfileId: executorProfile2.id,
        skillId: contentSkill.id,
      },
    },
    create: {
      executorProfileId: executorProfile2.id,
      skillId: contentSkill.id,
      level: 4,
    },
    update: {},
  });

  // -----------------------------------------------------------------
  // مشتری نمونه
  // -----------------------------------------------------------------
  const customer = await ensureUserWithWallet({
    phone: '09120000009',
    fullName: 'مشتری نمونه',
    role: UserRole.customer,
  });

  // -----------------------------------------------------------------
  // خدمات و پکیج‌ها
  // -----------------------------------------------------------------
  const websiteService = await prisma.serviceLine.upsert({
    where: { slug: 'website-design-development' },
    create: {
      slug: 'website-design-development',
      title: 'طراحی و توسعه سایت',
      category: 'طراحی و توسعه',
      description:
        'طراحی و پیاده‌سازی وب‌سایت اختصاصی با تیم اجرای مدیریت‌شده.',
      deliverables: 'وب‌سایت آماده انتشار + مستندات تحویل',
      pricingModel: 'manual_quote',
      slaHours: 120,
      revisionPolicy: 'حداکثر ۲ اصلاح رایگان',
      formFields: {
        create: [
          {
            label: 'هدف سایت',
            fieldKey: 'goal',
            fieldType: 'text',
            required: true,
            sortOrder: 1,
          },
          {
            label: 'تعداد صفحات تقریبی',
            fieldKey: 'pages_count',
            fieldType: 'number',
            required: false,
            sortOrder: 2,
          },
        ],
      },
      acceptanceCriteria: {
        create: [
          { description: 'سایت در مرورگرهای اصلی به‌درستی نمایش داده شود.' },
          { description: 'فرم تماس با موفقیت پیام ارسال کند.' },
        ],
      },
      qcChecklistTemplates: {
        create: {
          name: 'چک‌لیست QC وب‌سایت',
          items: {
            create: [
              { label: 'سایت روی موبایل درست نمایش داده می‌شود', sortOrder: 1 },
              { label: 'لینک‌های خراب وجود ندارد', sortOrder: 2 },
              { label: 'سرعت بارگذاری قابل قبول است', sortOrder: 3 },
            ],
          },
        },
      },
    },
    update: {},
    include: { packages: true },
  });

  if (websiteService.packages.length === 0) {
    await prisma.servicePackage.createMany({
      data: [
        {
          serviceId: websiteService.id,
          name: 'پایه',
          description: 'وب‌سایت تک‌صفحه‌ای',
          slaHours: 72,
        },
        {
          serviceId: websiteService.id,
          name: 'حرفه‌ای',
          description: 'وب‌سایت چندصفحه‌ای با پنل مدیریت',
          slaHours: 120,
        },
      ],
    });
  }

  await prisma.serviceLine.upsert({
    where: { slug: 'content-seo' },
    create: {
      slug: 'content-seo',
      title: 'محتوا و سئو',
      category: 'محتوا',
      description: 'تولید محتوای تخصصی و بهینه‌سازی برای موتورهای جستجو.',
      deliverables: 'مقالات آماده انتشار + گزارش سئو',
      pricingModel: 'fixed',
      basePrice: 2500000,
      slaHours: 48,
      revisionPolicy: 'حداکثر ۱ اصلاح رایگان',
      acceptanceCriteria: {
        create: [{ description: 'محتوا عاری از سرقت ادبی باشد.' }],
      },
    },
    update: {},
  });

  await prisma.serviceLine.upsert({
    where: { slug: 'market-research' },
    create: {
      slug: 'market-research',
      title: 'تحقیق و تحلیل بازار',
      category: 'پژوهش',
      description: 'تحلیل بازار هدف، رقبا و فرصت‌های رشد.',
      deliverables: 'گزارش تحلیلی PDF',
      pricingModel: 'manual_quote',
      slaHours: 96,
    },
    update: {},
  });

  console.log('---------------------------------------------');
  console.log('Seed کامل شد. اطلاعات ورود (رمز مشترک برای همه):');
  console.log(`رمز عبور پیش‌فرض: ${DEFAULT_PASSWORD}`);
  console.log('super_admin   : 09120000001');
  console.log('ops_admin     : 09120000002');
  console.log('finance_admin : 09120000003');
  console.log('support       : 09120000004');
  console.log('executor (وب) : 09120000005 (کد OPS-108)');
  console.log('executor (محتوا): 09120000006 (کد CNT-21)');
  console.log('customer      : 09120000009');
  console.log('---------------------------------------------');
  console.log(
    `customerId=${customer.id} executorProfile1Id=${executorProfile1.id}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
