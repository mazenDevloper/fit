@echo off
chcp 65001 >nul
REM تشغيل AMAP محلياً على http://localhost:8080
cd /d "%~dp0"
if not exist AMAP.html echo [تحذير] AMAP.html غير موجود في هذا المجلد.
if not exist car.glb echo [تحذير] car.glb غير موجود في هذا المجلد.
set URL=http://localhost:8080/AMAP.html
echo افتح: %URL%   (اترك هذه النافذة مفتوحة)
start "" "%URL%"
where python >nul 2>nul && (python -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (npx --yes http-server -p 8080 -c-1 & goto :eof)
echo [خطأ] لا يوجد Python ولا Node.js. افتح test-car.html بالنقر المزدوج لاختبار الموديل فقط.
pause
