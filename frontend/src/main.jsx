import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { ConfigProvider } from 'antd';
import uzUZ from 'antd/locale/uz_UZ';
import App from './App.jsx';
import { store } from './store/store.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ConfigProvider locale={uzUZ} theme={{ token: { colorPrimary: '#1677ff', borderRadius: 10 } }}>
        <App />
      </ConfigProvider>
    </Provider>
  </React.StrictMode>
);
