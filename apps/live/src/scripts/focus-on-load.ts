/**
 * Moves keyboard and screen-reader focus to the error list a server-rendered form page put at the top after a
 * failed submit. Without this script the page still works (the list is announced as an alert); it is a convenience.
 */
document.getElementById('form-errors')?.focus();
