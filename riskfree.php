<?php
// riskfree.php  ──> /riskfree.php  (no query params needed)
$apiKey = getenv('YHF_API_KEY');

$url = "https://current-treasury-rates.p.rapidapi.com/v1/Rates/Treasury/current";

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_HTTPHEADER     => [
        "x-rapidapi-key: $apiKey",
        "x-rapidapi-host: current-treasury-rates.p.rapidapi.com"
    ],
    CURLOPT_RETURNTRANSFER => true
]);

header('Content-Type: application/json');
echo curl_exec($ch);
curl_close($ch);
?>