import { HashRouter, Routes, Route } from 'react-router-dom';
import IdeWindow from './pages/IdeWindow';
import DatasetWindow from './pages/DatasetWindow';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Main Window */}
        <Route path="/" element={<IdeWindow />} />
        
        {/* Pop-out Dataset Window */}
        <Route path="/dataset" element={<DatasetWindow />} />
      </Routes>
    </HashRouter>
  );
}