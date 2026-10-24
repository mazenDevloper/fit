#!/bin/sh
# تشغيل AMAP محلياً على http://localhost:8080
cd "$(dirname "$0")" || exit 1

[ -f AMAP.html ] || echo "[تحذير] AMAP.html غير موجود في هذا المجلد."
[ -f car.glb ]   || echo "[تحذير] car.glb غير موجود في هذا المجلد."

URL="http://localhost:8080/AMAP.html"
echo "افتح: $URL   (اترك هذه النافذة مفتوحة)"
(sleep 1; (open "$URL" || xdg-open "$URL") >/dev/null 2>&1) &

if command -v python3 >/dev/null 2>&1; then
    exec python3 -m http.server 8080
elif command -v npx >/dev/null 2>&1; then
    exec npx --yes http-server -p 8080 -c-1
else
    echo "[خطأ] لا يوجد Python ولا Node.js. افتح test-car.html بالنقر المزدوج لاختبار الموديل فقط."
    exit 1
fi
