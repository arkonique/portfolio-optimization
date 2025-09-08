<?php
$api    = getenv('YHF_API_KEY2');
$ticker = urlencode($_GET['ticker'] ?? '');
$intvl  = $_GET['interval'] ?? '1d';
$limit  = intval($_GET['limit'] ?? 252);

$url = "https://yahoo-finance15.p.rapidapi.com/api/v2/markets/stock/history"
     . "?symbol=$ticker&interval=$intvl&limit=$limit";

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_HTTPHEADER      => [
    "x-rapidapi-key: $api",
    "x-rapidapi-host: yahoo-finance15.p.rapidapi.com"
  ],
  CURLOPT_RETURNTRANSFER  => true
]);
echo curl_exec($ch);
curl_close($ch);
?>