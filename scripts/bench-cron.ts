import { Cron } from 'croner';

// Benchmark cron calculation performance
function runBenchmark() {
  const expressions = [
    '0 2 * * *', // Daily at 02:00
    '*/5 * * * *', // Every 5 minutes
    '0 0 1 * *', // First of month
    '30 4 1,15 * 1-5', // Complex weekday schedule
  ];

  const timezones = ['UTC', 'America/New_York', 'Asia/Kolkata', 'Europe/London'];
  const iterations = 50000;

  console.log(`Starting Cron benchmark: ${iterations} iterations per schedule...\n`);

  for (const expr of expressions) {
    for (const tz of timezones) {
      const cron = new Cron(expr, { timezone: tz });
      const start = performance.now();
      let next = new Date();

      for (let i = 0; i < iterations; i++) {
        next = cron.nextRun(next) || new Date();
      }

      const totalMs = performance.now() - start;
      const perOpUs = (totalMs * 1000) / iterations;
      console.log(
        `Expr: "${expr}" | TZ: ${tz.padEnd(16)} | Total: ${totalMs.toFixed(2)}ms | ${perOpUs.toFixed(3)} µs/op`,
      );
    }
  }

  console.log('\nBenchmark completed.');
}

runBenchmark();
