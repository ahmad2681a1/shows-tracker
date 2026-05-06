@echo off
echo Updating GitHub Repository...
git add .
git commit -m "Auto-update: Mobile fixes and UI improvements"
git push origin main
echo.
echo ========================================
echo Update Completed! 
echo Refresh your GitHub page in 1 minute.
echo ========================================
pause
