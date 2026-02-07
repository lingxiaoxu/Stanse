import React from 'react';
import { createRoot } from 'react-dom/client';
import PortfolioReturnChart from '../components/charts/PortfolioReturnChart';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <PortfolioReturnChart />
    </React.StrictMode>
  );
}
