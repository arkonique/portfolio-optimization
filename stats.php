<?php
// stats.php  ──> /stats.php?module=statistics&ticker=AAPL
$apiKey = getenv('YHF_API_KEY2');
$module = urlencode($_GET['module'] ?? '');
$ticker = urlencode($_GET['ticker'] ?? '');

$url = "https://yahoo-finance15.p.rapidapi.com/api/v1/markets/stock/modules"
     . "?ticker=$ticker&module=$module";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER     => [
        "x-rapidapi-key: $apiKey",
        "x-rapidapi-host: yahoo-finance15.p.rapidapi.com"
    ],
    CURLOPT_RETURNTRANSFER => true
]);
header('Content-Type: application/json');
echo curl_exec($ch);
curl_close($ch);

?>