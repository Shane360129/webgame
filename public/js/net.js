/** WebSocket 客戶端：配對、輸入、快照、重連。 */

export class Net extends EventTarget {
  constructor({ id, name }) {
    super();
    this.id = id;
    this.name = name;
    this.ws = null;
    this.seq = 0;
    this.connected = false;
    this.retry = 0;
    this.latency = null;
    this.connect();
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);

    this.ws.onopen = () => {
      this.connected = true;
      this.retry = 0;
      this.send({ type: 'hello', id: this.id, name: this.name });
      this.emit('open');
      this.pingTimer = setInterval(() => {
        this.lastPing = performance.now();
        this.send({ type: 'ping', t: this.lastPing });
      }, 5000);
    };

    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'pong') {
        this.latency = Math.round(performance.now() - (msg.t || this.lastPing));
        return;
      }
      this.emit(msg.type, msg);
      this.emit('*', msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      this.emit('close');
      // 指數退避重連；重連後伺服器會自動把玩家接回進行中的對戰。
      this.retry = Math.min(this.retry + 1, 5);
      setTimeout(() => this.connect(), 500 * 2 ** (this.retry - 1));
    };

    this.ws.onerror = () => {};
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  queue(opts = {}) { this.send({ type: 'queue', ...opts }); }
  cancelQueue() { this.send({ type: 'cancelQueue' }); }
  play(index, x, z) { this.send({ type: 'play', index, x, z, seq: ++this.seq }); }
  champion(x, z) { this.send({ type: 'champion', x, z, seq: ++this.seq }); }
  ability() { this.send({ type: 'ability', seq: ++this.seq }); }
  resign() { this.send({ type: 'resign' }); }
}
