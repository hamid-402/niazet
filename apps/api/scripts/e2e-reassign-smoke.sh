#!/usr/bin/env bash
set -euo pipefail
BASE="http://localhost:3001/v1"
PASS="Passw0rd!123"

OPS_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"09120000002\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
CUSTOMER_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"09120000009\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')

SERVICE_ID=$(curl -s "$BASE/services" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(s=>s.slug==="website-design-development").id')

ORDER_ID=$(curl -s -X POST "$BASE/customer/orders" -H "Authorization: Bearer $CUSTOMER_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"serviceId\":\"$SERVICE_ID\",\"title\":\"تست ری‌اساین\",\"briefDescription\":\"سفارش تستی برای تست تغییر مسئول اجرا\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')

curl -s -X POST "$BASE/customer/orders/$ORDER_ID/submit" -H "Authorization: Bearer $CUSTOMER_TOKEN" > /dev/null
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/triage" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' -d '{"decision":"send_to_quote"}' > /dev/null
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/quote" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' -d '{"finalPrice": 4000000}' > /dev/null
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/accept-quote" -H "Authorization: Bearer $CUSTOMER_TOKEN" > /dev/null
PAY_JSON=$(curl -s -X POST "$BASE/customer/orders/$ORDER_ID/pay" -H "Authorization: Bearer $CUSTOMER_TOKEN")
PAYMENT_ID=$(echo "$PAY_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).payment.id')
curl -s -X POST "$BASE/customer/orders/$ORDER_ID/payments/$PAYMENT_ID/verify" -H "Authorization: Bearer $CUSTOMER_TOKEN" > /dev/null

STAFF_JSON=$(curl -s "$BASE/admin/staff" -H "Authorization: Bearer $OPS_TOKEN")
EXECUTOR1_ID=$(echo "$STAFF_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(s=>s.publicHandlerCode==="OPS-108").id')
EXECUTOR2_ID=$(echo "$STAFF_JSON" | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(s=>s.publicHandlerCode==="CNT-21").id')

echo "== assign to executor 1 (OPS-108) =="
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/assign" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"executorProfileId\":\"$EXECUTOR1_ID\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'

EXEC1_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"phone\":\"09120000005\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
echo "== executor1 starts work =="
curl -s -X POST "$BASE/executor/orders/$ORDER_ID/start" -H "Authorization: Bearer $EXEC1_TOKEN" | node -pe 'JSON.parse(require("fs").readFileSync(0)).status'
curl -s -X POST "$BASE/executor/orders/$ORDER_ID/progress-report" -H "Authorization: Bearer $EXEC1_TOKEN" -H 'Content-Type: application/json' -d '{"summary":"کار توسط اجراکننده اول شروع شد"}' > /dev/null

echo "== reassign to executor 2 (CNT-21) =="
curl -s -X POST "$BASE/admin/orders/$ORDER_ID/reassign" -H "Authorization: Bearer $OPS_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"executorProfileId\":\"$EXECUTOR2_ID\", \"note\":\"اجراکننده اول در دسترس نیست\"}"
echo

echo "== check executor1 no longer has access =="
curl -s "$BASE/executor/orders/$ORDER_ID" -H "Authorization: Bearer $EXEC1_TOKEN" -o /dev/null -w "executor1 access status: %{http_code} (expect 403)\n"

EXEC2_TOKEN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"phone\":\"09120000006\",\"password\":\"$PASS\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
echo "== check executor2 now has access and sees order status still in_progress =="
curl -s "$BASE/executor/orders/$ORDER_ID" -H "Authorization: Bearer $EXEC2_TOKEN" | node -pe 'const o=JSON.parse(require("fs").readFileSync(0)); JSON.stringify({status:o.status, reportsCount:o.reports.length})'

echo "== check customer sees updated handler code =="
curl -s "$BASE/customer/orders/$ORDER_ID" -H "Authorization: Bearer $CUSTOMER_TOKEN" | node -pe 'const o=JSON.parse(require("fs").readFileSync(0)); JSON.stringify(o.publicHandlers)'

echo "DONE"
