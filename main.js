// HWM, AAPL, NTDOY, TTWO

const YHF_API_HOST     = 'yahoo-finance15.p.rapidapi.com';

let parsed = []; // global variable to hold parsed ticker data
let analysisResults = []; // global variable to hold analysis results
let opt = {}; // global variable to hold optimization results
let samples = []; // global variable to hold samples for plotting


async function getHistoricalPrices(ticker) {
  // example: https://your-app.herokuapp.com/history.php?ticker=AAPL&interval=1d&limit=252
  const url = `/history.php?` +
              `ticker=${encodeURIComponent(ticker)}` +
              `&interval=1d&limit=252`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();                    // → { body: [...] }
  } catch (err) {
    console.error(`history fetch failed for ${ticker}:`, err);
    return null;
  }
}

/* --------------------------------------------------------------------------
   stats.php simply relays RapidAPI → browser, so the payload shape
   (data1.body.…, data2.body.…, etc.) stays identical.
   -------------------------------------------------------------------------- */
async function getStatsForTicker(ticker) {
  // call your PHP proxy instead of RapidAPI directly
  const url1 = `/stats.php?module=statistics&ticker=${encodeURIComponent(ticker)}`;
  const url2 = `/stats.php?module=financial-data&ticker=${encodeURIComponent(ticker)}`;

  try {
    /* fetch the SAME JSON your old code expected -------------------------- */
    const [response1, response2] = await Promise.all([
      fetch(url1),                // statistics module
      fetch(url2)                 // financial-data module
    ]);

    const data1 = await response1.json();
    const data2 = await response2.json();

    /* -----  everything below is verbatim from your original code  ------- */
    const forwardPE = data1.body.forwardPE?.raw
                   ?? (data2.body.currentPrice?.raw && data1.body.forwardEps?.raw
                        ? data2.body.currentPrice.raw / data1.body.forwardEps.raw
                        : null);

    const pegRatio            = forwardPE / (data2.body.earningsGrowth.raw * 100);
    const fiftyTwoWeekChange  = data1.body['52WeekChange'].raw * 100;
    const profitMargin        = data1.body.profitMargins.raw * 100;
    const freeCashFlowYield   = data2.body.freeCashflow.raw   * 100 /
                                (data2.body.currentPrice.raw * data1.body.sharesOutstanding.raw);
    const debtToEquity        = data2.body.debtToEquity.raw;
    const price               = data2.body.currentPrice.raw;

    return {
      ticker            : ticker,
      pegRatio,
      fiftyTwoWeekChange,
      profitMargin,
      freeCashFlowYield,
      debtToEquity,
      price
    };
  } catch (err) {
    console.error(`Error fetching ${ticker}:`, err);
    return null;
  }
}


//------------------------- Analyze each ticker data --------------------------------

function analyzeTickerData(tickerData, riskFreeRateAnnual = 0.01) {
  const { close } = tickerData;               // daily closes

  // -------- 1. daily log returns --------
  const logReturns = close.slice(1).map(
    (price, i) => Math.log(price / close[i])  // ln(P_t / P_{t-1})
  );

  if (logReturns.length === 0) {
    throw new Error('Need at least two price points for return calc');
  }

  // -------- 2. daily mean & stdev --------
  const meanDaily = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;

  const varianceDaily = logReturns.reduce(
    (s, r) => s + (r - meanDaily) ** 2,
    0
  ) / (logReturns.length - 1);

  const sdDaily = Math.sqrt(varianceDaily);

  // -------- 3. annualise --------
  const TRADING_DAYS = 252;
  const meanAnnual = meanDaily * TRADING_DAYS;          // μ × 252
  const sdAnnual   = sdDaily   * Math.sqrt(TRADING_DAYS); // σ × √252

  // -------- 4. Sharpe ratio --------
  const sharpe = (meanAnnual - riskFreeRateAnnual) / sdAnnual;

  // -------- 5. return nicely formatted --------
  return {
    ticker        : tickerData.ticker,
    volatility    : sdAnnual,      // annualised σ
    averageReturn : meanAnnual,    // annualised μ
    sharpeRatio   : sharpe
  };
}


// ------------------------ 3-Month T-Bill via Yahoo Finance ------------------------
async function getRiskFreeRate() {
  // call our PHP proxy instead of RapidAPI directly
  const response = await fetch('/riskfree.php');

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return response.json();           // ← still an array, so riskFreeData[3] works
}

// ------------------------ Find weights for maximum Sharpe Ratio using a random search ------------------------

function dailyLogReturns(close) {
  const r = new Array(close.length - 1);
  for (let i = 1; i < close.length; i++) {
    r[i - 1] = Math.log(close[i] / close[i - 1]);
  }
  return r;           // length 251
}

function matrixMultiply(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const rowsB = B.length;
  const colsB = B[0].length;
    if (colsA !== rowsB) {
        throw new Error('Matrix dimensions do not match for multiplication');
    }
    const result = Array.from({ length: rowsA }, () => Array(colsB).fill(0));
    for (let i = 0; i < rowsA; i++) {
        for (let j = 0; j < colsB; j++) {
            for (let k = 0; k < colsA; k++) {
                result[i][j] += A[i][k] * B[k][j];
            }
        }
    }
    return result;
}

function covMatrix(tickersRaw) {
  const n = tickersRaw.length;
  const m = tickersRaw[0].close.length - 1;   // returns per asset (251)

  // 2-A. build returns matrix & mean vector
  const R   = Array.from({ length: n }, (_, i) =>
              dailyLogReturns(tickersRaw[i].close));
  const mu  = R.map(row => row.reduce((s, x) => s + x, 0) / m);

  // 2-B. sample covariance (daily)
  const covDaily = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += (R[i][k] - mu[i]) * (R[j][k] - mu[j]);
      }
      const val = sum / (m - 1);   // unbiased
      covDaily[i][j] = covDaily[j][i] = val;
    }
  }

  // 2-C. annualise
  const factor = 252;
  return covDaily.map(row => row.map(c => c * factor));
}

// Monte Carlo simulation to find weights for maximum Sharpe Ratio
function findMaxSharpeWeights(tickersRaw, riskFreeRate) {
  const n = tickersRaw.length;
  const C = covMatrix(tickersRaw); // covariance matrix
  const numSimulations = 10000; // number of random portfolios to simulate
  const mu = tickersRaw.map(ticker => {
    const dailyReturns = dailyLogReturns(ticker.close);
    return dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length * 252; // annualize
    });

  const asRow = v => [v];                    // [a,b] -> [[a,b]]
  const asCol = v => v.map(x => [x]);        // [a,b] -> [[a],[b]]

  const muCol = asCol(mu);

  const samples = [];

  let bestSharpe  = -Infinity;
  let bestWeights = null;

  for (let i = 0; i < numSimulations; i++) {
    // random weights
    const weights = Array.from({ length: n }, () => Math.random());
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const normalizedWeights = weights.map(w => w / sumWeights); // normalize to sum to 1

    // expected return
    const expRet = matrixMultiply(asRow(normalizedWeights), muCol)[0][0];

    // variance of the portfolio
    const variance = matrixMultiply(
                       matrixMultiply(asRow(normalizedWeights), C),
                       asCol(normalizedWeights)
                     )[0][0];
    const vol = Math.sqrt(variance);
    const sharpe = (expRet - riskFreeRate) / vol; // Sharpe ratio
    if (sharpe > bestSharpe) {
      bestSharpe = sharpe;
      bestWeights = normalizedWeights;
    }
    samples.push({ weights: normalizedWeights, expRet, vol, sharpe });
  }
  let w = bestWeights.slice();    // start with the best weights found
  const alpha = 0.01;              // step size for gradient ascent                     

  for (let g = 0; g < numSimulations; g++) {

    // Σ w   (n × 1 -> flatten to 1-D)
    const CwCol = matrixMultiply(C, asCol(w));
    const Cw    = CwCol.map(r => r[0]);

    // portfolio stats
    const ret   = matrixMultiply(asRow(w), muCol)[0][0]; // wᵀ μ
    const varP  = matrixMultiply(asRow(w), CwCol)[0][0]; // wᵀ Σ w
    const volP  = Math.sqrt(varP);
    const S     = (ret - riskFreeRate) / volP;           // Sharpe

    // gradient (μ·σ − S·Σw) / var
    const grad  = mu.map((mu_i, i) => (mu_i * volP - S * Cw[i]) / varP);

    // ascent step + clip + renormalise
    w = w.map((wi, i) => Math.max(wi + alpha * grad[i], 0));
    const wSum = w.reduce((a, b) => a + b, 0);
    w = w.map(wi => wi / wSum);
  }

  // ---------- final Sharpe for reporting ----------
  const finalRet = matrixMultiply(asRow(w), muCol)[0][0];
  const finalVar = matrixMultiply(
                     matrixMultiply(asRow(w), C),
                     asCol(w)
                   )[0][0];
  const finalVol = Math.sqrt(finalVar);
  const finalSharpe = (finalRet - riskFreeRate) / finalVol;

  return { weights: w, sharpe: finalSharpe, expRet: finalRet, vol: finalVol, samples };
}
function calcCalEmf(samples, rf) {
  if (!samples.length) throw new Error('Need at least one portfolio sample');

  /* ── tangency (max-Sharpe) ─────────────────────────────────────── */
  let tangency = samples[0];
  for (const p of samples) {
    const s = (p.expRet - rf) / p.vol;
    if (s > tangency.sharpe) tangency = { ...p, sharpe: s };
  }
  const calSlope = tangency.sharpe;
  const calFn    = σ => rf + calSlope * σ;

  /* ── upper (efficient) frontier only ───────────────────────────── */
  const sorted      = samples.slice().sort((a, b) => a.vol - b.vol);
  const frontierVol = [];
  const frontierRet = [];
  let   maxMu       = -Infinity;

  for (const p of sorted) {
    if (p.expRet > maxMu) {
      frontierVol.push(p.vol);
      frontierRet.push(p.expRet);
      maxMu = p.expRet;
    }
  }

  return {
    tangencyPortfolio: tangency,
    calSlope,
    calFn,
    frontierVol,   // upper σ
    frontierRet    // upper μ
  };
}

// ---- quick least-squares poly fit (risk = Σ a_k · return^k) -------------
// 4th-degree least-squares fit:  risk = Σ a_k · return^k
function polyFit(x, y, deg = 6) {
  const n = x.length;
  const A = Array.from({ length: deg + 1 }, () =>
              Array(deg + 1).fill(0));
  const b = Array(deg + 1).fill(0);

  for (let i = 0; i <= deg; i++) {
    let sumYX = 0;                              // Σ y·x^i  accumulator
    for (let j = 0; j <= deg; j++) {
      let s = 0;                                // Σ x^(i+j)
      for (let k = 0; k < n; k++) {
        const xi = Math.pow(x[k], i);
        s += xi * Math.pow(x[k], j);            // build A
        if (j === 0) sumYX += y[k] * xi;        // build b (only once per j loop)
      }
      A[i][j] = s;
    }
    b[i] = sumYX;
  }

  // --- tiny Gaussian elimination (matrix is only 5×5 when deg=4) ---
  for (let i = 0; i <= deg; i++) {
    // pivot row with largest abs value
    let max = i;
    for (let k = i + 1; k <= deg; k++)
      if (Math.abs(A[k][i]) > Math.abs(A[max][i])) max = k;
    [A[i], A[max]] = [A[max], A[i]];
    [b[i], b[max]] = [b[max], b[i]];

    const piv = A[i][i];
    for (let j = i; j <= deg; j++) A[i][j] /= piv;
    b[i] /= piv;

    for (let k = 0; k <= deg; k++) if (k !== i) {
      const f = A[k][i];
      for (let j = i; j <= deg; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  return b;                                       // [a0, a1, a2, a3, a4]
}


function extractPointsOnEnvelope(samples, step = 0.002) {
  // bucket by return rounded to nearest 'step'
  const buckets = new Map();
  for (const p of samples) {
    const key = Math.round(p.expRet / step) * step;
    let entry = buckets.get(key);
    if (!entry) { buckets.set(key, { min: p, max: p }); continue; }
    if (p.vol < entry.min.vol) entry.min = p;   // upper edge
    if (p.vol > entry.max.vol) entry.max = p;   // lower edge
  }

  const hull = [];
  // concat lower then upper so risk ascends left→right
  [...buckets.values()].forEach(({ max }) => hull.push(max));
  [...buckets.values()].reverse().forEach(({ min }) => hull.push(min));

  return {
    hullVol: hull.map(p => p.vol),
    hullRet: hull.map(p => p.expRet)
  };
}


//-------------------------------------- Make animated plots ----------------------------------------------------
function makeAnimatedPlot(
  analysisResults,
  samples,
  frontierVol, frontierRet,
  calSlope,
  riskFreeRate = 0.01,
  containerId  = 'display_test',
  bestVol      = null,         // σ  of max-Sharpe
  bestRet      = null,         // μ  of max-Sharpe
  bestSharpe   = null          // Sharpe value
) {
  /* 1 · ticker dots ------------------------------------------------- */
  const tickX  = analysisResults.map(a => a.volatility);
  const tickY  = analysisResults.map(a => a.averageReturn);
  const tickTxt = analysisResults.map(a =>
    `${a.ticker}<br>` +
    `Sharpe: ${a.sharpeRatio.toFixed(2)}<br>` +
    `Risk: ${(a.volatility*100).toFixed(1)}%<br>` +
    `Return: ${(a.averageReturn*100).toFixed(1)}%`
  );
  plotAnimatedScatter(tickX, tickY, tickTxt, '#C3B1E1', 400, containerId);

  /* 2 · sample cloud after 1 s ------------------------------------- */
  setTimeout(() => {
    const maxSamples = 100;
    const step       = Math.ceil(samples.length / maxSamples);
    const trimmed    = samples.filter((_, i) => i % step === 0);

    const sX   = trimmed.map(p => p.vol);
    const sY   = trimmed.map(p => p.expRet);
    const sTxt = trimmed.map(p =>
      `Sharpe: ${p.sharpe.toFixed(2)}<br>` +
      `Risk: ${(p.vol*100).toFixed(1)}%<br>` +
      `Return: ${(p.expRet*100).toFixed(1)}%`
    );

    plotAnimatedScatter(
      sX, sY, sTxt, '#FF6961', 1, containerId,
      gd => {
        /* 3 · fitted upper frontier line --------------------------- */
        const coeff  = polyFit(frontierRet, frontierVol, 2);
        const denseR = [];
        for (let r = Math.min(...frontierRet);
                 r <= Math.max(...frontierRet)+5;
                 r += 0.002) denseR.push(r);
        const fittedVol = denseR.map(r =>
          coeff.reduce((s, a, k) => s + a * Math.pow(r, k), 0)
        );

        Plotly.addTraces(gd, {
          x: fittedVol,
          y: denseR,
          mode: 'lines',
          line: { color: '#000000', width: 4 },
          name: 'Upper Frontier',
          hoverinfo: 'skip'
        });

        /* 4 · capital allocation line ----------------------------- */
        const calX = [], calY = [];
        for (let s = 0; s <= 1.5; s += 0.01) {
          calX.push(s);
          calY.push(calSlope * s + riskFreeRate);
        }
        Plotly.addTraces(gd, {
          x: calX,
          y: calY,
          mode: 'lines',
          line: { color: 'red', width: 2, dash: 'dash' },
          name: 'CAL',
          hoverinfo: 'skip'
        });

        /* 5 · big gold dot + hover + arrow label ------------------ */
        setTimeout(() => {
          if (bestVol !== null && bestRet !== null && bestSharpe !== null) {
          /* dot */
          Plotly.addTraces(gd, {
            x: [bestVol],
            y: [bestRet],
            mode: 'markers',
            marker: {
              size: 16,
              color: '#FFD700',
              line: { width: 2, color: '#000' }
            },
            text: [ `Best Sharpe: ${bestSharpe.toFixed(2)}<br>` +
              `Average Return: ${(bestRet * 100).toFixed(1)}%<br>` +
              `Risk: ${(bestVol * 100).toFixed(1)}%`
            ],
            hovertemplate: '%{text}<extra></extra>',
            name: 'Best Sharpe'
          });

          /* arrow label */
          const anno = {
            x: bestVol,
            y: bestRet,
            text: 'Best&nbsp;Sharpe',
            showarrow: true,
            arrowhead: 2,
            ax: 40, ay: -40,          // offset label box
            font: { color: '#000', size: 12 },
            arrowcolor: '#000',
            bgcolor: '#FFFFFF'
          };
          const cur = gd.layout.annotations || [];
          Plotly.relayout(gd, { annotations: cur.concat(anno) });
        }
      }, 1000); // wait 1 s before adding the dot
      }
    );
  }, 1000);
}


function plotAnimatedScatter(x, y, labels, color, delay, container, onDone) {

   const div = typeof container === 'string'
              ? document.getElementById(container)
              : container;

const layout = {
  title: {
    text   : 'Risk–Return of All Possible Portfolios and Stocks',
    x      : 0.5,
    xanchor: 'center'
  },

  xaxis: {
    title: {                       // <-- wrap in an object
      text: 'Risk (σ)',
      standoff: 10                 // pushes it away from the axis
    },
    tickformat: '.1%',             // 0.0 % → 100.0 %
    range: [0, 1.5]
  },

  yaxis: {
    title: {
      text: 'Return (μ)',
      standoff: 10
    },
    tickformat: '.1%',
    range: [-0.1, 1.5]
  },

  showlegend: false,
  margin: { t: 60, l: 80, r: 30, b: 70 } // a hair more room for the labels
};
  const firstTime = !div.data;

  const trace = { x: [], y: [], text: [], mode: 'markers',
                  marker: { size: 9, color } };

  const ready = firstTime
      ? Plotly.newPlot(div, [trace], layout)               // Promise
      : Promise.resolve( Plotly.addTraces(div, trace) );   // now a Promise too

  ready.then(gd => {
    
    const myIndex   = gd.data.length - 1;     // our trace position
    const prefix    = `tr${myIndex}_`;        // <-- add this line

    const frames = x.map((_, i) => ({
      name: prefix + i,                       // unique frame names
      data: gd.data.map((d, k) =>
        k === myIndex
          ? { x: x.slice(0, i + 1),
              y: y.slice(0, i + 1),
              text: labels.slice(0, i + 1) }
          : {}
      )
    }));


    Plotly.addFrames(gd, frames);
    Plotly.animate(
      gd,
      frames.map(f => f.name),
      { frame: { duration: delay, redraw: true },
        transition: { duration: 0 },
        mode: 'immediate' }
    );

    const total = frames.length * delay + 20;   // 20 ms safety pad
      if (onDone) setTimeout(() => onDone(gd), total);
  });
}

//---------------------------------------------------------------------------------------------------------------

//---------------------- Portfolio plot ---------------------------------------------------

function plotIndexedGrowth(tickersRaw, weights, containerId) {
  if (tickersRaw.length !== weights.length) {
    throw new Error('weights length must equal number of tickers');
  }

  /* ---- 0 · make sure weights sum to 1 --------------------------------- */
  const totalW = weights.reduce((s, w) => s + w, 0);
  const wNorm   = weights.map(w => w / totalW);

  /* ---- 1 · shared time axis ------------------------------------------- */
  const dates = tickersRaw[0].timestamp.map(d => new Date(d));

  /* ---- 2 · stock traces + portfolio accumulation ---------------------- */
  const portfolioIdx = Array(dates.length).fill(0);
  const traces       = [];

  tickersRaw.forEach((tkr, i) => {
    const idx = tkr.close.map(p => p / tkr.close[0]);      // start at 1

    // build portfolio index on-the-fly
    for (let d = 0; d < idx.length; d++) {
      portfolioIdx[d] += wNorm[i] * idx[d];
    }

    traces.push({
      x   : dates,
      y   : idx,
      name: tkr.ticker,
      mode: 'lines',
      line: { width: 1.5 }
    });
  });

  /* ---- 3 · tangency portfolio trace ----------------------------------- */
  traces.push({
    x   : dates,
    y   : portfolioIdx,
    name: 'Tangency Portfolio',
    mode: 'lines',
    line: { color: '#000000', width: 3 }
  });

  /* ---- 4 · layout with a top-centred title ---------------------------- */
  const layout = {
    title: {
      text   : 'Growth of $1: Stocks vs Tangency Portfolio',
      x      : 0.5,      // centred
      xanchor: 'center'
    },
    xaxis : { title: 'Date' },
    yaxis : { title: 'Index (start = 1)' },
    legend: { orientation: 'h', x: 0, y: -0.2 },
    margin: { t: 80, l: 60, r: 20, b: 80 }  // extra top margin for the title
  };

  /* ---- 5 · plot -------------------------------------------------------- */
  Plotly.newPlot(containerId, traces, layout);
}

//---------------------- Event listener for button click --------------------------------
async function handleButtonClick() {
    // Risk free rate
  const riskFreeData = await getRiskFreeRate();
  const riskFreeRate = riskFreeData[3].rate / 100; // Convert to decimal
  const input    = document.getElementById('userInput').value;
  const tickers  = input.split(',').map(t => t.trim().toUpperCase());
  const display  = document.getElementById('cards');
  display.innerHTML = '<div class="card full"><h3>Fetching Data...</h3></div>'; // clear previous cards


  /* Fetch every ticker in parallel */
  const raw = await Promise.all(tickers.map(getHistoricalPrices));
  const stats = await Promise.all(tickers.map(getStatsForTicker));
  console.log('Stats:', stats);

  /* ----- Massage into {ticker, open[], close[], high[], low[], timestamp[]} ----- */
  parsed = raw
    .map((res, i) => {
      if (!res?.body?.length) {                       // guard against null/empty
        console.warn(`No data for ${tickers[i]}`);
        return null;
      }
      const open      = res.body.map(d => d.open);
      const close     = res.body.map(d => d.close);
      const high      = res.body.map(d => d.high);
      const low       = res.body.map(d => d.low);
      const timestamp = res.body.map(d => d.timestamp);

      return { ticker: tickers[i], open, close, high, low, timestamp };
    })
    .filter(Boolean);                                 // drop tickers with no data


    // Analyze each ticker data
    analysisResults = parsed.map(tickerData => {
        return analyzeTickerData(tickerData, riskFreeRate);
    });
    
    // display covariance matrix
    const cov = covMatrix(parsed);

    // Find weights for maximum Sharpe Ratio
({ samples, ...opt } = findMaxSharpeWeights(parsed, riskFreeRate));
const { frontierVol, frontierRet, calSlope } = calcCalEmf(samples, riskFreeRate);

makeAnimatedPlot(
  analysisResults,
  samples,
  frontierVol, frontierRet,   // only these four args
  calSlope,                // capital allocation line slope
  riskFreeRate,                // risk-free rate
  'market'              // container id
  , opt.vol, opt.expRet, opt.sharpe
);

plotIndexedGrowth(parsed, opt.weights, 'portfolio');
    cardFiller(analysisResults, stats);

}

const fmt = (val, decimals = 2) =>
  (typeof val === 'number' && Number.isFinite(val)) ? val.toFixed(decimals) : '?';


function getLight(metric, val) {
  if (!Number.isFinite(val)) return '';      // Unknown → neutral (grey)

  const rule = {
    pegRatio:           v => v <= 0 ? 'red' : v < 1 ? 'green' : v <= 2 ? 'yellow' : 'red',
    averageReturn:       v => v > 7      ? 'green'  : v >= 0      ? 'yellow' : 'red',
    volatility:          v => v < 0.15   ? 'green'  : v <= 0.30   ? 'yellow' : 'red',
    sharpeRatio:         v => v > 1      ? 'green'  : v >= 0.3    ? 'yellow' : 'red',
    fiftyTwoWeekChange:  v => v > 10     ? 'green'  : v >= -10    ? 'yellow' : 'red',
    profitMargin:        v => v > 15     ? 'green'  : v >= 5      ? 'yellow' : 'red',
    freeCashFlowYield:   v => v > 5      ? 'green'  : v >= 2      ? 'yellow' : 'red',
    debtToEquity:        v => v < 50    ? 'green'  : v <= 150    ? 'yellow' : 'red',
    // quickRatio, psToSalesGrowth, etc. → add here when/if you display them
  }[metric];

  return rule ? rule(val) : '';
}

function span(metric, rawVal, displayVal, suffix = '', dp = 2) {
  const colour = metric === 'price' ? 'blue' : getLight(metric, rawVal);
  return `<span class="value ${colour}">${fmt(displayVal, dp)}${suffix}</span>`;
}

// ---------- main card filler ----------
function cardFiller(analysisResults, stats) {
  const card = document.getElementById('cards');
  card.innerHTML = '';

  analysisResults.forEach((tickerData, i) => {
    const stat = stats[i];
    if (!stat) return;

    const cardContent = `
      <div class="card">
        <h2>${tickerData.ticker}</h2>

        <p>Current Price $${span('price',
                                  stat.price,
                                  stat.price)}</p>

        <p>Average Return ${span('averageReturn',
                                 tickerData.averageReturn,        // raw for colour
                                 tickerData.averageReturn * 100,  // shown as %
                                 '%')}</p>

        <p>Volatility ${span('volatility',
                             tickerData.volatility,
                             tickerData.volatility * 100,
                             '%')}</p>

        <p>Sharpe Ratio ${span('sharpeRatio',
                               tickerData.sharpeRatio,
                               tickerData.sharpeRatio)}</p>

        <p>PEG Ratio ${span('pegRatio',
                            stat.pegRatio,
                            stat.pegRatio)}</p>

        <p>52-Week Change ${span('fiftyTwoWeekChange',
                                 stat.fiftyTwoWeekChange,
                                 stat.fiftyTwoWeekChange,
                                 '%')}</p>

        <p>Profit Margin ${span('profitMargin',
                                stat.profitMargin,
                                stat.profitMargin,
                                '%')}</p>

        <p>Free Cash Flow Yield ${span('freeCashFlowYield',
                                       stat.freeCashFlowYield,
                                       stat.freeCashFlowYield,
                                       '%')}</p>

        <p>Debt to Equity ${span('debtToEquity',
                                 stat.debtToEquity,
                                 stat.debtToEquity)}%</p>
      </div>
    `;
    card.innerHTML += cardContent;
  });

  //unhide #investment section
  const investmentSection = document.getElementById('investment');
  investmentSection.style.display = 'flex';
}

//---------------------- Dollar divide weights --------------------------------
function dollarDivide(weights, tickers, investment = 1000) {
  const dollarWeights = weights.map(w => w * investment);
  const result = {};
  tickers.forEach((ticker, i) => {
    result[ticker] = dollarWeights[i].toFixed(2);
  });
  return result;
}

function handleInvestmentButtonClick() {
  const input = document.getElementById('investmentInput').value;
  const investment = parseFloat(input);
  if (isNaN(investment) || investment <= 0) {
    alert('Please enter a valid investment amount.');
    return;
  }

  const weights = opt.weights; // Use the global opt variable

  const tickers = parsed.map(t => t.ticker);
  const dollarWeights = dollarDivide(weights, tickers, investment);

  const resultDiv = document.getElementById('investmentOutput');
  resultDiv.innerHTML = '<h3>Investment Distribution:</h3>';
  for (const ticker in dollarWeights) {
    resultDiv.innerHTML += `<p class="investedDollars"><span class="ticker">${ticker}</span> <span class="investmentAmount">$${dollarWeights[ticker]}</span></p>`;
  }
  const footer = document.getElementById('footer');
  footer.style.display = 'flex'; // Show the footer with the investment results
}