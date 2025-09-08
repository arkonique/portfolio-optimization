<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Portfolio Optimizer</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="main.css" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
  <link rel="manifest" href="/site.webmanifest">
</head>
<body>
  <h6>I Don't Understand...</h6>
  <h1>Portfolio Optimization</h1>
  <h4>Think of this app as a friendly investing sidekick: you feed it a handful of stock symbols and it instantly surfaces bite-sized health checks—profit margin, volatility, dividend yield, and other tell-tale stats—so you can see how each pick is doing on its own. Then it crunches the risk-versus-return math to spotlight the most balanced portfolio among your choices and, once you enter a dollar amount, lays out a clear “put-this-much-here” recipe for spreading your money across those stocks. <span style="font-style: italic;"><b>Disclaimer:</b> The information and calculations provided are for educational and informational purposes only and do not constitute financial, investment, or trading advice. Always consult a qualified professional before making investment decisions.</span></h4>
  <div id="inputhandler">
    <input id="userInput"  placeholder="Enter tickers e.g. AAPL,MSFT,GOOG" value="HWM, NTDOY, AAPL, TTWO" />
    <button onclick="handleButtonClick()">Optimize</button>
  </div>
  <div id="cards">
    <div class="card full">
      <h3>Input some Tickers</h3>
    </div>
  </div>
  <div id="explanation">
    <p>Numbers looking a bit cryptic? No worries—here's what each one really means in plain English:</p>
    <ul>
      <li><b>Current Price $:</b> What one share costs right now - simply the going rate.</li>
      <li><b>Average Return:</b> The stock's typical price gain (or loss) over the past year. Bigger positives are greener; negatives turn red.</li>
      <li><b>Volatility:</b> How wildly the price swings. A low percentage means a steadier ride; high volatility can feel like a roller-coaster and scarier to hold for long.</li>
      <li><b>Sharpe Ratio:</b> Tells you how much extra return you're earning for every extra percent risk you take. Higher numbers = more reward for  the risk - exactly what investors (you) want.</li>
      <li><b>PEG Ratio:</b> Compares today's price to how fast earnings are expected to grow. Below 1 looks cheap for its growth annd might be a good purchase, around 1-2 is fair, above 2 can be pricey.</li>
      <li><b>52-Week Change:</b> One-year scoreboard - shows whether the stock's been on a winning streak or sliding backwards.</li>
      <li><b>Profit Margin:</b> Share of every sales dollar kept as profit - fatter margins give the company more cash to weather rough patches and keep paying you.</li>
      <li><b>Free Cash-Flow Yield:</b> Cash left after bills, expressed as a percent of company value; higher yields mean more money to reinvest or return to shareholders (which is good for you!).</li>
      <li><b>Debt-to-Equity:</b> Shows how much of the business is powered by loans versus its own money; lower means less debt to service (safer for you), while a high ratio tells you you're taking on extra risk because lenders must be paid before shareholders.</li>
      </ul>
      <p><i>Color key:</i> <span style="color:green;">Green = generally favourable</span>, <span style="color:orange;">Yellow = needs another look</span>, <span style="color:red;">Red = caution flag</span>.</p>
      <p>Now let's check out the graphs - don't worry, I'll break them down for you in just a moment:</p>
  </div>
  <div id="charts">
    <div id="market"></div>
    <div id="portfolio"></div>
  </div>
  <div id="explanation2">
    <p><b>So, what is the first graph? Let's take a closer look:</b></p>
    <p>Think of the risk-return chart as a playground map for your money: the horizontal axis shows how jumpy a price has been (risk), while the vertical axis shows how much that money has grown on average (return). Each purple dot is a single stock, so you can instantly see which names have been steady and which ones have sprinted - or stumbled. The cloud of red dots comes from thousands of different ways to mix those stocks; together they reveal every trade-off you could choose just by tweaking the amounts you put into each stock. Skimming along the top-left edge of that cloud is a solid black curve called the “efficient frontier,” which marks the smartest trade-offs. You can't climb higher without also sliding right into more risk. The red dashed line shooting up from the theoretical risk-free point (think government treasury bills) through the golden dot is the capital-allocation line; it shows how you could blend some ultra-safe cash with that best-mix portfolio to dial your personal risk exactly where you want it while staying as efficient as possible. Sitting on the black curve and the red line is a shiny golden dot, the portfolio with the highest Sharpe ratio, meaning it squeezes the most reward out of every unit of risk. That is called the tangency portfolio, and it is the one you want to focus on. The golden dot is the best of the best, so let's see how it actually performs.</p>
  </div>
<div id="explanation3">
  <p><b>Now, let’s look at the second graph—the “growth of $1” picture.</b></p>

  <p>Each coloured line shows what would have happened if you'd put a single dollar into one stock a year ago, while the solid black line tracks that same dollar in the Sharpe-maximised - or “tangency” - portfolio.  Notice how the black line usually moves more smoothly than the others: that's the diversification benefit at work, keeping the ride steadier without giving up much return. You might spot an individual line finishing higher than the black one and wonder if going all-in on that stock would have been smarter.  Hindsight makes any winner look obvious, but predicting it in advance is tough.  Instead, you can aim for higher gains <em>and</em> keep diversification by adding <b>leverage</b>. Leverage simply means borrowing extra cash  and investing those borrowed dollars in the tangency portfolio. So with the same amount of YOUR OWN money, you can increase your returns, while still keeping the lowest possible risk.</p>
</div>


<div id="investment">
    <h3>Now let us figure out how much you should invest in each stock:</h3>
    <div class="investment_input">
      <p>Please enter the amount you want to invest</p>
      <input id="investmentInput" type="number" placeholder="Investment Amount" value="1000" />
      <button id="investmentButton" onclick="handleInvestmentButtonClick()">Invest</button>
      <div id="investmentOutput"></div>
    </div>
    <div id="footer"><p>As you can see, your total has been converted into a straightforward dollar allocation for each stock. I hope the walkthrough above clarifies how these numbers were produced and how you might use them in your own planning. Happy investing! <i>(All figures are provided for educational purposes only and do not constitute financial advice.)</i></p>
  </div>
</div>
<div id="rights">&copy; 2025 Riddhi Mandal</div>

<script src='https://cdn.plot.ly/plotly-3.0.1.min.js'></script>
<script src="main.js"></script>
</body>
</html>
