import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribe, getSession, setSession, request } from './net.js';
import { GameCtx, syncClock } from './ui.jsx';
import { APP_NAME } from './config.js';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';
import GameScreen from './screens/GameScreen.jsx';

export default function App() {
  const [view, setView] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [toastMsg, setToastMsg] = useState(null);
  const [notice, setNotice] = useState(null);
  const toastTimer = useRef(null);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3500);
  }, []);

  useEffect(() => {
    document.title = APP_NAME;
    return subscribe((evt) => {
      if (evt.type === 'status') setStatus(evt.status);
      if (evt.type === 'state') {
        syncClock(evt.view.serverNow);
        setView(evt.view);
      }
      if (evt.type === 'ended') {
        setView(null);
        setNotice(evt.message);
      }
    });
  }, []);

  const leave = useCallback(async () => {
    await request('leave');
    setSession(null);
    setView(null);
  }, []);

  const onJoined = (code, token) => {
    setSession({ code, token });
    setNotice(null);
    const u = new URL(location.href);
    if (u.searchParams.has('join')) {
      u.searchParams.delete('join');
      history.replaceState(null, '', u.pathname);
    }
  };

  const ctx = { view, toast, leave };
  const hasSession = !!getSession();

  let screen;
  if (!view) screen = hasSession && status !== 'open' ? <div className="center-screen"><p className="muted">Reconnecting to your game…</p></div> : <Home onJoined={onJoined} notice={notice} />;
  else if (view.phase === 'lobby') screen = <Lobby />;
  else screen = <GameScreen />;

  return (
    <GameCtx.Provider value={ctx}>
      <div className={`app phase-${view?.phase || 'home'}`}>
        {status !== 'open' && view && <div className="conn-banner">Connection lost. Reconnecting…</div>}
        {screen}
        {toastMsg && (
          <div className="toast" role="status">
            {toastMsg}
          </div>
        )}
      </div>
    </GameCtx.Provider>
  );
}
