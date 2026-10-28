#!/usr/bin/env bash
# اسکریپت دستی برای عبور کامل از چرخه عمر یک سفارش روی سرور محلی (فقط برای تست دستی/دیباگ).
set -euo pipefail
BASE="http://localhost:3001/v1"
PASS="Passw0rd!123"

echo "== login customer =="
CUSTOMER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"09120000009\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
echo "customer token acquired"

echo "== login ops admin =="
OPS_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"09120000002\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
echo "ops token acquired"

SERVICE_ID=$(curl -s "$BASE/services" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(s=>s.slug==="website-design-development").id')
echo "serviceId=$SERVICE_ID"

echo "== create order =="
ORDER_JSON=$(curl -s -X POST "$BASE/customer/orders" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"serviceId\":\"$SERVICE_ID\",\"title\":\"سایت فروشگاهی\",\"briefDescription\":\"نیاز به سایت فروشگاهی ساده دارم\"}")
ORDER_ID=$(echo "$ORDER_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
echo "orderId=$ORDER_ID"

echo "== submit =="
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/submit" -H "Authorization: Bearer $CUSTOMER_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== triage (send_to_quote) =="
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/triage" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"decision":"send_to_quote"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== quote =="
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/quote" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"finalPrice": 5000000, "note": "قیمت نهایی"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== accept quote =="
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/accept-quote" -H "Authorization: Bearer $CUSTOMER_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== pay =="
PAY_JSON=$(curl -s -X POST "$BASE/customer/orders/$ORDER_ID/pay" -H "Authorization: Bearer $CUSTOMER_TOKEN")
echo "$PAY_JSON"
PAYMENT_ID=$(echo "$PAY_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).payment.id')

echo "== verify payment =="
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/payments/$PAYMENT_ID/verify" -H "Authorization: Bearer $CUSTOMER_TOKEN"
echo

echo "== check order status after payment =="
curl -s "$BASE/customer/orders/$ORDER_ID" -H "Authorization: Bearer $CUSTOMER_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== list staff to find executorProfileId =="
STAFF_JSON=$(curl -s "$BASE/admin/staff" -H "Authorization: Bearer $OPS_TOKEN")
EXECUTOR_PROFILE_ID=$(echo "$STAFF_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(s=>s.publicHandlerCode==="OPS-108").id')
echo "executorProfileId=$EXECUTOR_PROFILE_ID"

echo "== assign =="
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/assign" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"executorProfileId\":\"$EXECUTOR_PROFILE_ID\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== login executor =="
EXECUTOR_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"09120000005\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

echo "== executor start =="
curl -s -X POST "$BASE/executor/orders/$ORDER_ID/start" -H "Authorization: Bearer $EXECUTOR_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== executor progress report =="
curl -s -X POST "$BASE/executor/orders/$ORDER_ID/progress-report" -H "Authorization: Bearer $EXECUTOR_TOKEN" -H 'Content-Type: application/json' \
  -d '{"summary":"طراحی اولیه انجام شد"}' > /dev/null
echo ok

echo "== executor deliver (service requires QC) =="
curl -s -X POST "$BASE/executor/orders/$ORDER_ID/deliver" -H "Authorization: Bearer $EXECUTOR_TOKEN" -H 'Content-Type: application/json' \
  -d '{"summary":"سایت آماده است","fileIds":[]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== admin qc queue =="
QUEUE_JSON=$(curl -s "$BASE/admin/qc/queue" -H "Authorization: Bearer $OPS_TOKEN")
echo "$QUEUE_JSON"
REVIEW_ID=$(echo "$QUEUE_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0))[0].id')

echo "== qc approve =="
curl -s -X POST "$BASE/admin/qc/$REVIEW_ID/approve" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"comment":"تایید شد"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== customer confirm =="
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/confirm" -H "Authorization: Bearer $CUSTOMER_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

echo "== customer wallet after confirm (should be unaffected, executor+platform got paid) =="
curl -s "$BASE/customer/wallet" -H "Authorization: Bearer $CUSTOMER_TOKEN"
echo

echo "== executor wallet after release (should have 80% of 5,000,000) =="
curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"phone\":\"09120000005\",\"password\":\"$PASS\"}" > /tmp/exec_login.json

echo "== feedback (compliment to executor) =="
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/feedback" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"targetType":"executor","publicHandlerCode":"OPS-108","feedbackType":"compliment","rating":5,"comment":"عالی بود"}'
echo

echo "== ADMIN FINANCE: ledger entries for this order-related escrow =="
curl -s "$BASE/admin/finance/ledger" -H "Authorization: Bearer $(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"phone\":\"09120000003\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')"
echo

echo "DONE"
