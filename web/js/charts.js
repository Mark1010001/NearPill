/* NearPill Admin Portal - Chart.js Engine */

let gmvChartInstance = null;
let leaderboardChartInstance = null;
let topMedsChartInstance = null;

function initGMVChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (gmvChartInstance) {
    gmvChartInstance.destroy();
  }

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  gmvChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [{
        label: 'Gross Merchandise Value (₱)',
        data: [184000, 210000, 195000, 248000, 280000, 310000, 295000],
        borderColor: '#10b981',
        borderWidth: 3,
        backgroundColor: gradient,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#006c49',
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' GMV: ₱' + context.raw.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: '#e2ece7' },
          ticks: {
            callback: function(value) {
              return '₱' + (value / 1000) + 'k';
            }
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function initLeaderboardChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (leaderboardChartInstance) {
    leaderboardChartInstance.destroy();
  }

  const pharmacies = NearPillData.pharmacies;
  const labels = pharmacies.map(p => p.name.split(' - ')[0]);
  const data = pharmacies.map(p => p.totalSales);

  leaderboardChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Revenue (₱)',
        data: data,
        backgroundColor: [
          '#10b981',
          '#006c49',
          '#3b82f6',
          '#8b5cf6',
          '#f59e0b'
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ' Sales: ₱' + context.raw.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          grid: { color: '#e2ece7' },
          ticks: {
            callback: function(value) {
              return '₱' + (value / 1000) + 'k';
            }
          }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}

function initTopMedicinesChart(canvasId) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (topMedsChartInstance) {
    topMedsChartInstance.destroy();
  }

  topMedsChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Biogesic 500mg', 'Amoxil 500mg', 'Neozep Forte', 'Lipitor 20mg', 'Alaxan FR'],
      datasets: [{
        data: [1420, 890, 750, 520, 480],
        backgroundColor: [
          '#10b981',
          '#006c49',
          '#3b82f6',
          '#f59e0b',
          '#8b5cf6'
        ],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      },
      cutout: '70%'
    }
  });
}
