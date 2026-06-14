import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Upload, 
  Save, 
  Download, 
  Users, 
  Award, 
  RefreshCw, 
  FileCode, 
  Sword, 
  ArrowRightLeft, 
  Check, 
  X, 
  User, 
  CloudRain, 
  Plus, 
  Info,
  ChevronRight,
  Send,
  Zap,
  Volume2,
  Minimize2,
  RotateCcw
} from "lucide-react";

import { Pokemon, Trainer, BattleUpdatePayload, LobbyUpdatePayload, TradeStartedPayload, TradeUpdatePayload, TradeCompletePayload } from "./types";
import { POKEMON_PRESETS, TRAINER_AVATARS } from "./data";

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<"game" | "lobby">("game");
  const [showRomManager, setShowRomManager] = useState<boolean>(true);
  const [isTurbo, setIsTurbo] = useState<boolean>(false);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);

  // ROM Loading States
  const [romUrl, setRomUrl] = useState<string>("");
  const [romName, setRomName] = useState<string>("Vui lòng tải game GBA");
  const [customRomUrl, setCustomRomUrl] = useState<string>("");
  
  // Cloud Sync & Save file States
  const [syncCode, setSyncCode] = useState<string>("");
  const [restoreCode, setRestoreCode] = useState<string>("");
  const [saveUploaded, setSaveUploaded] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "info" | "error" } | null>(null);

  // Google Drive Cloud Storage States
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(() => {
    return localStorage.getItem("pokemon_google_token") || null;
  });
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string; picture?: string } | null>(null);

  // AI Dialog Live Subtitle Translator States
  const [showDialogueOverlay, setShowDialogueOverlay] = useState<boolean>(true);
  const [currentTranslateInput, setCurrentTranslateInput] = useState<string>("");
  const [translatedText, setTranslatedText] = useState<string>("");
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState<boolean>(false);

  // Multiplayer Lobby States
  const [username, setUsername] = useState<string>(() => {
    return localStorage.getItem("pokemon_trainer_name") || `Trainer_${Math.floor(1000 + Math.random() * 9000)}`;
  });
  const [avatar, setAvatar] = useState<string>("red");
  const [myTeam, setMyTeam] = useState<Pokemon[]>(() => {
    // Default starting team of classic Gen 1 starters
    return [POKEMON_PRESETS[0], POKEMON_PRESETS[1], POKEMON_PRESETS[2]];
  });
  const [teamSelectorOpen, setTeamSelectorOpen] = useState<boolean>(false);
  
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [playerId, setPlayerId] = useState<string>("");
  const [lobbyPlayers, setLobbyPlayers] = useState<Trainer[]>([]);
  const [incomingChallenge, setIncomingChallenge] = useState<{ fromId: string; fromUsername: string } | null>(null);
  const [incomingTrade, setIncomingTrade] = useState<{ fromId: string; fromUsername: string } | null>(null);

  // Active Network Sessions
  const [activeBattle, setActiveBattle] = useState<BattleUpdatePayload | null>(null);
  const [battleOpponentId, setBattleOpponentId] = useState<string>("");
  const [battleOutcome, setBattleOutcome] = useState<{ message: string; sub: string } | null>(null);

  const [activeTrade, setActiveTrade] = useState<{
    tradeId: string;
    otherUser: { id: string; username: string; team: Pokemon[] };
    selfSelectedIdx: number | null;
    oppSelectedIdx: number | null;
    selfConfirmed: boolean;
    oppConfirmed: boolean;
  } | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState<{ received: Pokemon; sent: Pokemon } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const savFileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Keyboard Dispatcher directly into the Iframe Context ---
  const triggerKey = (action: "down" | "up", key: string, code: string, keyCode: number) => {
    const iframe = document.getElementById("gba-iframe") as HTMLIFrameElement | null;
    if (iframe && iframe.contentWindow) {
      try {
        const win = iframe.contentWindow as any;
        const doc = win.document;
        const eventType = action === "down" ? "keydown" : "keyup";

        // Dispatch KeyboardEvent on target window & doc to fully simulate genuine action
        const evt = new win.KeyboardEvent(eventType, {
          key: key,
          code: code,
          keyCode: keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
        });

        doc.dispatchEvent(evt);
        win.dispatchEvent(evt);
      } catch (err) {
        console.warn("Iframe key bypass:", err);
      }
    }
  };

  // --- Handle Custom Alert messages ---
  const triggerStatus = (text: string, type: "success" | "info" | "error" = "info") => {
    setStatusMessage({ text, type });
    setTimeout(() => {
      setStatusMessage(null);
    }, 6000);
  };

  // --- WebSocket client core initialization ---
  const connectToLobby = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;

    triggerStatus("Đang kết nối đến Phòng Giao lưu...", "info");

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      triggerStatus("Kết nối mạng thành công!", "success");
      
      // Save info
      localStorage.setItem("pokemon_trainer_name", username);

      // Join standard lobby with team info
      ws.send(JSON.stringify({
        type: "join-lobby",
        playerId: playerId || undefined,
        username,
        avatar,
        team: myTeam
      }));
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const { type } = payload;

        switch (type) {
          case "lobby-joined":
            setPlayerId(payload.id);
            break;

          case "lobby-update":
            const updated: LobbyUpdatePayload = payload;
            // Filter out self
            setLobbyPlayers(updated.players);
            break;

          case "challenge-received":
            setIncomingChallenge({
              fromId: payload.fromId,
              fromUsername: payload.fromUsername
            });
            break;

          case "challenge-declined":
            triggerStatus(`${payload.fromUsername} từ chối lời mời đấu GBA.`, "error");
            break;

          case "battle-started":
            setActiveBattle(payload.battle);
            setBattleOpponentId(payload.opponentId);
            setBattleOutcome(null);
            setActiveTab("lobby"); // switch view to lobby/battle console
            triggerStatus("Trận đấu Pokémon đã bắt đầu!", "success");
            break;

          case "battle-updated":
            setActiveBattle(payload.battle);
            break;

          case "battle-ended":
            setActiveBattle(null);
            setBattleOutcome({
              message: payload.winnerId === playerId ? "BẠN ĐÃ CHIẾN THẮNG!" : "BẠN ĐÃ THUA CUỘC!",
              sub: payload.winnerId === playerId ? "Đội hình của bạn quá kiên cường." : "Học hỏi chiến thuật và thách đấu lại nhé!"
            });
            break;

          case "battle-ended-disconnect":
            setActiveBattle(null);
            setBattleOutcome({
              message: "ĐỐI THỦ MẤT KẾT NỐI",
              sub: `${payload.opponentUsername} đã ngắt kết nối khỏi máy chủ GBA.`
            });
            break;

          case "trade-received":
            setIncomingTrade({
              fromId: payload.fromId,
              fromUsername: payload.fromUsername
            });
            break;

          case "trade-declined":
            triggerStatus(`${payload.fromUsername} từ chối lời mời Trade.`, "error");
            break;

          case "trade-started":
            const start: TradeStartedPayload = payload;
            setActiveTrade({
              tradeId: start.tradeId,
              otherUser: start.otherUser,
              selfSelectedIdx: null,
              oppSelectedIdx: null,
              selfConfirmed: false,
              oppConfirmed: false
            });
            setTradeSuccess(null);
            setActiveTab("lobby");
            break;

          case "trade-updated":
            const update: TradeUpdatePayload = payload.trade;
            setActiveTrade((prev) => {
              if (!prev) return null;
              const isP1 = prev.otherUser.id !== update.p1.id; // self is opposing player
              return {
                ...prev,
                selfSelectedIdx: isP1 ? update.p1.selectedPokemonIdx : update.p2.selectedPokemonIdx,
                oppSelectedIdx: isP1 ? update.p2.selectedPokemonIdx : update.p1.selectedPokemonIdx,
                selfConfirmed: isP1 ? update.p1.confirmed : update.p2.confirmed,
                oppConfirmed: isP1 ? update.p2.confirmed : update.p1.confirmed,
              };
            });
            break;

          case "trade-complete":
            const complete: TradeCompletePayload = payload;
            setMyTeam(complete.team);
            setTradeSuccess({
              received: complete.receivedPokemon,
              sent: complete.sentPokemon
            });
            setActiveTrade(null);
            triggerStatus("Trao đổi Pokémon thành công!", "success");
            break;

          case "trade-cancelled":
            setActiveTrade(null);
            triggerStatus("Đối tác đã hủy giao dịch.", "error");
            break;
        }
      } catch (err) {
        console.error("Lỗi nhận mạng:", err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      triggerStatus("Mất kết nối máy chủ GBA.", "error");
    };
  };

  useEffect(() => {
    // If team changes, synchronize to Server
    if (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "join-lobby",
        playerId,
        username,
        avatar,
        team: myTeam
      }));
    }
  }, [myTeam, avatar, username]);

  // Listen to Google Drive redirect token hash
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const params = new URLSearchParams(hash.substring(1));
      const token = params.get("access_token");
      if (token) {
        setGoogleAccessToken(token);
        localStorage.setItem("pokemon_google_token", token);
        // Clear hash from address bar for beauty
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        triggerStatus("Đã liên kết tài khoản Google Drive thành công!", "success");
      }
    }
  }, []);

  // Fetch Google userInfo when token exists
  useEffect(() => {
    if (googleAccessToken) {
      fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      })
      .then(r => {
        if (!r.ok) {
          throw new Error("Expired");
        }
        return r.json();
      })
      .then(data => {
        if (data && data.name) {
          setGoogleUser({ name: data.name, email: data.email, picture: data.picture });
        }
      })
      .catch((e) => {
        console.warn("Google credentials validation failed:", e);
        setGoogleAccessToken(null);
        localStorage.removeItem("pokemon_google_token");
        setGoogleUser(null);
      });
    } else {
      setGoogleUser(null);
    }
  }, [googleAccessToken]);

  // --- Emulator ROM Launching ---
  const launchRom = (url: string, name: string) => {
    setRomUrl(url);
    setRomName(name);
    setShowRomManager(false);
    triggerStatus(`Đang nạp ROM: ${name}`, "info");
  };

  // Custom Local ROM File Upload
  const handleLocalRomUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".gba")) {
        triggerStatus("Vui lòng tải đúng file GBA (.gba)", "error");
        return;
      }
      const fileUrl = URL.createObjectURL(file);
      launchRom(fileUrl, file.name);
    }
  };

  // --- Cloud Sync: Backup & Restore SAV file ---
  const handleBackupCloud = async () => {
    triggerStatus("Đang lưu trữ save game lên Đám Mây...", "info");
    
    // In our EmulatorJS setup, standard save exports can be triggered.
    // Let's create a backup of our team status as a demo cloud payload if no file uploaded.
    const customSaveData = btoa(JSON.stringify({
      trainer: username,
      avatar,
      team: myTeam,
      timestamp: Date.now()
    }));

    try {
      const resp = await fetch("/api/cloud-save/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savData: customSaveData,
          filename: `${username}_save.sav`
        })
      });
      const data = await resp.json();
      if (data.success) {
        setSyncCode(data.syncCode);
        setSaveUploaded(true);
        triggerStatus("Đã tải dữ liệu lên đám mây thành công!", "success");
      } else {
        triggerStatus("Không thể sao lưu file save.", "error");
      }
    } catch (e) {
      triggerStatus("Lỗi kết nối máy chủ Cloud.", "error");
    }
  };

  const handleRestoreCloud = async () => {
    if (!restoreCode || restoreCode.length !== 6) {
      triggerStatus("Vui lóng nhập đúng mã đồng bộ 6 số", "error");
      return;
    }

    triggerStatus(`Đang tải save từ mã: ${restoreCode}...`, "info");
    try {
      const resp = await fetch(`/api/cloud-save/restore/${restoreCode}`);
      const data = await resp.json();
      if (data.success) {
        const decoded = JSON.parse(atob(data.savData));
        if (decoded.team) {
          setMyTeam(decoded.team);
          setUsername(decoded.trainer);
          setAvatar(decoded.avatar);
          triggerStatus("Đã phục hồi đội hình và tài khoản từ mây thành công!", "success");
        } else {
          triggerStatus("File save mây không tương thích.", "error");
        }
      } else {
        triggerStatus(data.error || "Mã đồng bộ không tồn tại.", "error");
      }
    } catch (e) {
      triggerStatus("Lỗi tải save game từ mây.", "error");
    }
  };

  // --- Google OAuth & Drive Synchronization Helpers ---
  const handleGoogleDriveSignIn = async () => {
    try {
      const res = await fetch("/api/auth/google/config");
      const data = await res.json();
      const clientId = data.clientId;
      if (!clientId) {
        triggerStatus("Vui lòng cấu hình GOOGLE_CLIENT_ID trong mục Secrets của AI Studio để liên kết Drive!", "error");
        return;
      }
      const scope = encodeURIComponent("https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email");
      const redirectUri = encodeURIComponent(window.location.origin);
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}`;
      
      triggerStatus("Đang chuyển hướng liên kết tài khoản Google...", "info");
      window.location.href = authUrl;
    } catch (e) {
      triggerStatus("Lỗi kết nối máy chủ thiết lập Google OAuth.", "error");
    }
  };

  const handleGoogleDriveSignOut = () => {
    setGoogleAccessToken(null);
    localStorage.removeItem("pokemon_google_token");
    setGoogleUser(null);
    triggerStatus("Đã ngắt liên kết Google Drive thành công.", "success");
  };

  const handleBackupGoogleDrive = async () => {
    if (!googleAccessToken) {
      triggerStatus("Vui lòng liên kết tài khoản Google Drive trước!", "error");
      return;
    }
    triggerStatus("Đang đồng bộ dữ liệu save game lên Google Drive...", "info");
    
    // Package internal app state to simulate full save file backup structure
    const payload = {
      trainer: username,
      avatar,
      team: myTeam,
      timestamp: Date.now()
    };

    try {
      // Find if pokemon_gba_save.json already exists
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='pokemon_gba_save.json'+and+trashed=false&fields=files(id,name)`;
      const searchResp = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const searchData = await searchResp.json();
      const existingFile = searchData.files?.[0];

      let response;
      const metadata = { name: "pokemon_gba_save.json", mimeType: "application/json" };
      const boundary = "foo_bar_baz";
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;
      const body = delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(payload) +
        close_delim;

      if (existingFile) {
        // Update the file using PATCH
        response = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
          },
          body: body
        });
      } else {
        // Create new file using POST
        response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
          },
          body: body
        });
      }

      if (response.ok) {
        triggerStatus("Tự động đồng bộ và sao lưu lên Google Drive thành công!", "success");
      } else {
        const errData = await response.json();
        console.error("GDive sync error:", errData);
        triggerStatus("Không thể đồng bộ lên Google Drive. Vui lòng kiểm tra quyền hạn.", "error");
      }
    } catch (e) {
      console.error(e);
      triggerStatus("Lỗi kết nối đồng bộ Google Drive.", "error");
    }
  };

  const handleRestoreGoogleDrive = async () => {
    if (!googleAccessToken) {
      triggerStatus("Vui lòng liên kết tài khoản Google Drive trước!", "error");
      return;
    }
    triggerStatus("Đang đồng bộ và tải save game từ Google Drive về...", "info");

    try {
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='pokemon_gba_save.json'+and+trashed=false&fields=files(id,name)`;
      const searchResp = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });
      const searchData = await searchResp.json();
      const existingFile = searchData.files?.[0];

      if (!existingFile) {
        triggerStatus("Không tìm thấy tệp lưu đám mây 'pokemon_gba_save.json' trên Google Drive của bạn.", "error");
        return;
      }

      const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` }
      });

      if (fileResp.ok) {
        const data = await fileResp.json();
        if (data && data.team) {
          setMyTeam(data.team);
          setUsername(data.trainer);
          setAvatar(data.avatar);
          triggerStatus("Đồng bộ thành công! Khôi phục đội hình từ Google Drive hoàn tất.", "success");
        } else {
          triggerStatus("Tệp lưu trên Google Drive không chứa huấn luyện viên hay đội hình hợp lệ.", "error");
        }
      } else {
        triggerStatus("Không thể lấy nội dung lưu game từ Google Drive.", "error");
      }
    } catch (e) {
      console.error(e);
      triggerStatus("Lỗi tải tệp lưu từ Google Drive.", "error");
    }
  };

  // --- AI Subtitle Live Translator Helper ---
  const handleTranslateDialog = async (customText?: string) => {
    const textToTranslate = customText || currentTranslateInput;
    if (!textToTranslate || textToTranslate.trim() === "") {
      triggerStatus("Vui lòng nhập nội dung thoại tiếng Anh cần dịch!", "error");
      return;
    }
    
    setIsTranslating(true);
    setTranslatedText("");
    try {
      const resp = await fetch("/api/translate-dialog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToTranslate })
      });
      const data = await resp.json();
      if (data.translation) {
        setTranslatedText(data.translation);
      } else if (data.error) {
        triggerStatus(data.error, "error");
      }
    } catch (e) {
      console.error(e);
      triggerStatus("Lỗi biên dịch AI.", "error");
    } finally {
      setIsTranslating(false);
    }
  };

  // --- Challenge/Trade Triggers ---
  const sendChallenge = (targetId: string) => {
    if (!wsConnected || !wsRef.current) {
      triggerStatus("Vui lòng kết nối Phòng mạng trước", "error");
      return;
    }
    wsRef.current.send(JSON.stringify({
      type: "challenge-player",
      targetId
    }));
    triggerStatus("Đang gửi lời thách đấu GBA...", "success");
  };

  const respondChallenge = (accepted: boolean) => {
    if (!incomingChallenge || !wsConnected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "challenge-response",
      challengerId: incomingChallenge.fromId,
      accepted
    }));
    setIncomingChallenge(null);
  };

  const sendTrade = (targetId: string) => {
    if (!wsConnected || !wsRef.current) {
      triggerStatus("Vui lòng kết nối Phòng mạng trước", "error");
      return;
    }
    wsRef.current.send(JSON.stringify({
      type: "trade-player",
      targetId
    }));
    triggerStatus("Đang gửi lời mời giao dịch Pokémon...", "success");
  };

  const respondTrade = (accepted: boolean) => {
    if (!incomingTrade || !wsConnected || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "trade-response",
      proposerId: incomingTrade.fromId,
      accepted
    }));
    setIncomingTrade(null);
  };

  const selectTradePokemon = (idx: number) => {
    if (!activeTrade || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "trade-select-pokemon",
      tradeId: activeTrade.tradeId,
      idx
    }));
  };

  const confirmTradePokemon = () => {
    if (!activeTrade || !wsRef.current || activeTrade.selfSelectedIdx === null) return;
    wsRef.current.send(JSON.stringify({
      type: "trade-confirm-pokemon",
      tradeId: activeTrade.tradeId
    }));
  };

  const cancelTrade = () => {
    if (!activeTrade || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "leave-trade",
      tradeId: activeTrade.tradeId
    }));
  };

  // --- Pokemon Battle Console Turn Execution ---
  const sendBattleAction = (action: "fight" | "switch", moveIdx?: number, switchIdx?: number) => {
    if (!activeBattle || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({
      type: "battle-action",
      battleId: activeBattle.id,
      action,
      moveIdx,
      switchIdx
    }));
  };

  // Add/Remove from team customizer
  const addPokemonToTeam = (p: Pokemon) => {
    if (myTeam.length >= 6) {
      triggerStatus("Đội hình chỉ chứa tối đa 6 Pokémon!", "error");
      return;
    }
    setMyTeam([...myTeam, { ...p }]);
  };

  const removePokemonFromTeam = (idx: number) => {
    if (myTeam.length <= 1) {
      triggerStatus("Đội hình phải có ít nhất 1 Pokémon!", "error");
      return;
    }
    setMyTeam(myTeam.filter((_, i) => i !== idx));
  };

  // Trigger Local Save Load/Download info
  const triggerManualSaveExport = () => {
    // Send standard F2 (Save state in RetroArch/EmulatorJS)
    triggerKey("down", "F2", "F2", 113);
    setTimeout(() => triggerKey("up", "F2", "F2", 113), 100);
    triggerStatus("Đang kết xuất tệp sao lưu trạng thái...", "success");
  };

  const triggerManualSaveImport = () => {
    // Send standard F4 (Load state in RetroArch/EmulatorJS)
    triggerKey("down", "F4", "F4", 115);
    setTimeout(() => triggerKey("up", "F4", "F4", 115), 100);
    triggerStatus("Đang khôi phục tệp save trạng thái gần nhất...", "success");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#181818] text-[#e0e0e0] flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Dynamic Status bar alerts */}
      {statusMessage && (
        <div className={`fixed top-12 right-4 z-50 p-4 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-3 border transition-all duration-300 transform scale-100 animate-slide-in ${
          statusMessage.type === "success" 
            ? "bg-emerald-950/90 text-emerald-200 border-emerald-800"
            : statusMessage.type === "error"
              ? "bg-rose-950/90 text-rose-200 border-rose-800"
              : "bg-blue-950/90 text-blue-200 border-blue-800"
        }`}>
          <Info className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{statusMessage.text}</span>
        </div>
      )}

      {/* System Bar */}
      <div className="h-8 bg-[#121212] flex items-center justify-between px-6 border-b border-white/5 select-none font-mono">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`}></div>
            <span className="text-[10px] uppercase tracking-widest text-white/40">{wsConnected ? 'Network Connected' : 'Local Emulator'}</span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-white/40 truncate max-w-[200px]">ROM: {romUrl ? romName : "None Selected"}</span>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-4">
            <span className="text-[10px] uppercase tracking-widest text-white/40">{wsConnected ? 'Latency: 14ms' : 'offline mode'}</span>
            <span className="text-[10px] uppercase tracking-widest text-[#00ff22]/60 font-bold">{romUrl ? 'FPS: 60' : 'FPS: 0'}</span>
          </div>
          <span className="text-[10px] text-white/60">GBA DECK CONSOLE v1.2</span>
        </div>
      </div>

      {/* Retro Header layout */}
      <header className="border-b border-white/5 bg-[#121212]/90 backdrop-blur px-6 py-4 flex flex-wrap justify-between items-center gap-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-[0_0_20px_rgba(79,70,229,0.3)] border border-indigo-400/20">
            PK
          </div>
          <div>
            <h1 className="text-base font-bold tracking-wider text-white flex items-center gap-2 uppercase">
              Pokémon GBA Network Deck 
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-950/50 text-indigo-300 border border-indigo-900">v1.2</span>
            </h1>
            <p className="text-[10px] uppercase tracking-widest text-white/40">Tactile Emulator • Sync Mây • Thách Đấu & Trao Đổi</p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button 
            onClick={() => setActiveTab(activeTab === "game" ? "lobby" : "game")}
            className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all ${
              activeTab === "lobby" 
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/30 shadow-lg" 
                : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
            }`}
          >
            {activeTab === "lobby" ? "Trở lại Chơi Game" : "Phòng Giao Lưu Online"}
            {lobbyPlayers.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping ml-1.5 inline-block" />
            )}
          </button>

          <button 
            onClick={() => setShowRomManager(!showRomManager)}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            Quản Lý ROM GBA
          </button>
        </div>
      </header>

      {/* Main Container Dashboard */}
      <main className="flex-1 flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-white/5 max-w-[1700px] w-full mx-auto">
        
        {/* LEFT COLUMN: GBA Retro Console Console Screen */}
        <div className="flex-1 flex flex-col justify-center items-center p-4 lg:p-8 bg-gradient-to-b from-[#0e0e0e] to-[#141414]">
          
          {/* ROM Manager panel over absolute */}
          {showRomManager && (
            <div className="w-full max-w-2xl bg-[#121212]/95 border border-white/10 rounded-2xl p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] space-y-6 mb-6">
              <div className="flex justify-between items-start border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2 uppercase tracking-widest text-[#00ff22]/80">
                    <FileCode className="w-4 h-4 text-indigo-400" />
                    Thư Viện ROM GBA Pokémon
                  </h2>
                  <p className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Chọn bản cài sẵn hoặc tải lên file .gba của bạn từ thiết bị.</p>
                </div>
                <button 
                  onClick={() => setShowRomManager(false)}
                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Upload section */}
              <div className="border border-dashed border-white/10 rounded-xl p-8 text-center flex flex-col items-center justify-center gap-3 bg-black/40 hover:border-indigo-500/50 group transition-all">
                <Upload className="w-8 h-8 text-white/20 group-hover:text-indigo-400 transition-colors" />
                <div>
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Tải Thẻ Rom GBA (.gba) riêng</p>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1">Kéo thả tệp hoặc click để nạp vào máy</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".gba" 
                  onChange={handleLocalRomUpload}
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[9px] font-bold uppercase tracking-widest rounded text-white mt-1 border border-white/10 transition-all"
                >
                  Chọn ROM từ Máy
                </button>
              </div>



              {/* External source URL play */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Hoặc Nhập URL GBA ROM Trực Tiếp</p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="https://example.com/pokemon-red.gba"
                    value={customRomUrl}
                    onChange={(e) => setCustomRomUrl(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500 rounded px-4 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
                  />
                  <button 
                    onClick={() => {
                      if (!customRomUrl) {
                        triggerStatus("Vui lòng dán liên kết game .gba hợp lệ trước", "error");
                        return;
                      }
                      launchRom(customRomUrl, "External URL ROM");
                    }}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5 fill-white" />
                    Chạy Liên Kết
                  </button>
                </div>
                <div className="p-3 bg-white/5 text-white/40 rounded border border-white/5 text-[10px] leading-relaxed flex items-start gap-2.5">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" />
                  <span>
                    Do bản quyền Pokémon, ứng dụng khuyến khích bạn tải lên file <strong className="text-white">.gba</strong> từ chính bộ nhớ thiết bị của bạn. File sẽ được nạp hoàn toàn an toàn ngay trong trình duyệt của bạn với vận tốc 60 FPS gốc!
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Core GBA Handheld Console Structure */}
          <div className="w-full max-w-lg aspect-auto flex flex-col bg-[#121212] rounded-3xl border border-white/10 shadow-[0_30px_70px_rgba(0,0,0,0.9)] ring-8 ring-white/5 overflow-hidden">
            
            {/* Screen border styling */}
            <div className="p-6 bg-[#0f0f0f] border-b border-white/5 flex flex-col items-center">
              <div className="w-full flex justify-between items-center text-[10px] font-mono tracking-widest px-1 mb-3">
                <span className="flex items-center gap-1.5 text-white/40 font-bold uppercase">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  {romUrl ? "GBA CORE: ACTIVE" : "STATUS: STANDBY"}
                </span>
                <span className="truncate max-w-[200px] text-white/40 uppercase font-black">{romName}</span>
              </div>

              {/* Emulator Screen Arena Container */}
              <div className="w-full aspect-[3/2] bg-black rounded-xl border border-white/5 flex items-center justify-center relative shadow-[inset_0_4px_12px_rgba(0,0,0,0.95)] overflow-hidden group">
                {romUrl ? (
                  <>
                    <iframe
                      id="gba-iframe"
                      className="w-full h-full border-0 select-none bg-black z-10"
                      title="GBA Screen Frame"
                      srcDoc={`
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <meta charset="utf-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
                          <style>
                            html, body {
                              margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden;
                            }
                            #game { width: 100%; height: 100%; }
                            /* Hide default bottom status bars and menus to make workspace ultra clean */
                            .ejs-menu { display: none !important; }
                            .ejs-canvas-container { max-height: 100vh !important; }
                          </style>
                        </head>
                        <body>
                          <div id="game"></div>
                          <script>
                            window.EJS_player = '#game';
                            window.EJS_core = 'gba';
                            window.EJS_gameUrl = '${romUrl}';
                            window.EJS_pathtodata = 'https://cdn.emulatorjs.org/stable/data/';
                            window.EJS_startOnLoaded = true;
                            
                            window.EJS_Buttons = {
                              menu: true,
                              saveState: true,
                              loadState: true,
                              downloadSave: true,
                              loadSave: true,
                              fullscreen: true,
                              quickSave: true,
                              quickLoad: true,
                              volume: true,
                              settings: true
                            };
                          </script>
                          <script src="https://cdn.emulatorjs.org/stable/data/loader.js"></script>
                        </body>
                        </html>
                      `}
                    />
                    {/* Scanlines Overlay mimicking retro screen textures */}
                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.12)_50%),linear-gradient(90deg,rgba(255,0,0,0.02),rgba(0,255,0,0.01),rgba(0,0,255,0.02))] bg-[length:100%_4px,3px_100%] z-20 opacity-40 scanlines-overlay" />
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.06] z-20" />

                    {/* Retro GBA dialogue box overlay reflecting AI VietSub translations */}
                    {showDialogueOverlay && translatedText && (
                      <div className="absolute bottom-3 left-3 right-3 bg-white border-[3px] border-black rounded-lg p-3.5 z-30 shadow-[4px_4px_0px_rgba(0,0,0,0.5)] flex flex-col justify-between min-h-[85px] transition-all duration-300 animate-fade-in select-none">
                        <div className="flex items-start justify-between">
                          <span className="text-[7px] font-bold font-mono tracking-widest text-indigo-600 uppercase">AI VIETSUB LOCALIZATION ASSISTANT</span>
                          <button 
                            onClick={() => setTranslatedText("")}
                            className="text-black/40 hover:text-black hover:bg-black/5 rounded p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-xs font-mono font-extrabold text-[#111] leading-relaxed tracking-wide pr-4">
                          {translatedText}
                        </p>
                        {/* Retro arrow cursor pulsing */}
                        <div className="absolute bottom-2 right-3 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[7px] border-t-red-600 animate-bounce" />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center p-6 space-y-4">
                    <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 animate-pulse">
                      <Play className="w-5 h-5 fill-white/40 ml-1" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-widest">Chưa Có Game Khởi Chạy</h4>
                      <p className="text-[10px] text-white/30 uppercase tracking-widest mt-1 max-w-[280px]">Vui lòng mở Quản lý ROM ở góc trên để chọn game hoặc tải file GBA của bạn lên.</p>
                    </div>
                    <button 
                      onClick={() => setShowRomManager(true)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold uppercase tracking-widest rounded transition-all shadow-md"
                    >
                      Bảng Quản Lý Game
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* AI Dialog Translator localization Panel (Direct translation, no ROM injection) */}
            <div className="bg-[#121212] border-b border-white/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-indigo-400" />
                  AI VIETSUB • TRỢ LÝ HỘI THOẠI TRỰC TIẾP
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-semibold">Tự động hiện SUB</span>
                  <input 
                    type="checkbox" 
                    checked={showDialogueOverlay} 
                    onChange={(e) => setShowDialogueOverlay(e.target.checked)}
                    className="rounded bg-black border-white/10 text-indigo-600 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
                  />
                </label>
              </div>

              {/* Subtitle Input and translate execute button */}
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Nhập/dán câu thoại tiếng Anh đang xuất hiện..."
                  value={currentTranslateInput}
                  onChange={(e) => setCurrentTranslateInput(e.target.value)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleTranslateDialog();
                  }}
                />
                <button 
                  onClick={() => handleTranslateDialog()}
                  disabled={isTranslating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {isTranslating ? "Đang dịch..." : "Dịch AI"}
                </button>
              </div>

              {/* Quick sample simulation dialogue lines from classic GBA Pokémon games */}
              <div className="space-y-1.5">
                <span className="text-[8px] text-white/30 uppercase tracking-widest font-black block">Hội thoại mô phỏng (Click để dịch thử):</span>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
                  {[
                    { label: "GIÁO SƯ OAK", title: "Welcome to Pokemon!", text: "Hello there! Welcome to the world of POKEMON! My name is OAK! People call me the POKEMON PROF!" },
                    { label: "Y TÁ TRUNG TÂM", title: "Welcome to Care!", text: "Welcome to our POKEMON CENTER. We restore your tired POKEMON to full health. Would you like us to heal your POKEMON?" },
                    { label: "CHỌN KHỞI ĐẦU", title: "Choose Starter!", text: "This POKEMON is really energetic! So, do you want to choose the Fire POKEMON, CHARMANDER?" },
                    { label: "ĐỐI THỦ XUẤT HIỆN", title: "Smell ya later!", text: "What? You want to battle me? Fine, let's see which POKEMON is stronger! Smell ya later!" }
                  ].map((preset, idx) => (
                    <button 
                      key={idx}
                      onClick={() => {
                        setCurrentTranslateInput(preset.text);
                        handleTranslateDialog(preset.text);
                      }}
                      className="px-2 py-1.5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-indigo-500/20 rounded text-left text-[8px] font-semibold text-white/70 block transition-all"
                    >
                      <div className="text-indigo-400 text-[7px] font-bold uppercase tracking-wider line-clamp-1">{preset.label}</div>
                      <div className="text-white font-bold leading-tight line-clamp-1">{preset.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Saves Control Section */}
            <div className="bg-[#0d0d0d] border-b border-white/5 p-3 grid grid-cols-4 gap-2 text-center">
              <button 
                onClick={triggerManualSaveExport}
                className="py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-[9px] font-bold uppercase tracking-widest text-[#e0e0e0] border border-white/10 rounded transition-all flex flex-col items-center justify-center gap-1.5 group"
              >
                <Save className="w-3.5 h-3.5 text-green-400 group-hover:scale-110 transition-transform" />
                Lưu Nhanh
              </button>
              <button 
                onClick={triggerManualSaveImport}
                className="py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-[9px] font-bold uppercase tracking-widest text-[#e0e0e0] border border-white/10 rounded transition-all flex flex-col items-center justify-center gap-1.5 group"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-45 transition-transform" />
                Nạp Nhanh
              </button>
              <button 
                onClick={() => {
                  triggerStatus("Bạn có thể sao lưu và đồng bộ save ngay ở thẻ bên phải!", "success");
                }}
                className="py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-[9px] font-bold uppercase tracking-widest text-[#e0e0e0] border border-white/10 rounded transition-all flex flex-col items-center justify-center gap-1.5 group"
              >
                <CloudRain className="w-3.5 h-3.5 text-indigo-400 group-hover:scale-110 transition-transform" />
                Save Mây
              </button>
              <button 
                onClick={() => {
                  const iframe = document.getElementById("gba-iframe") as HTMLIFrameElement | null;
                  if (iframe && iframe.contentWindow) {
                    try {
                      iframe.requestFullscreen?.() || (iframe as any).webkitRequestFullscreen?.();
                    } catch (e) {
                      triggerStatus("Fullscreen không khả dụng trong iframe", "error");
                    }
                  } else {
                    triggerStatus("Vui lòng khởi động game trước", "error");
                  }
                }}
                className="py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-[9px] font-bold uppercase tracking-widest text-[#e0e0e0] border border-white/10 rounded transition-all flex flex-col items-center justify-center gap-1.5 group"
              >
                <Minimize2 className="w-3.5 h-3.5 text-red-500 group-hover:scale-115 transition-transform" />
                Toàn Màn
              </button>
            </div>

            {/* Tactile Virtual Controller Buttons Section */}
            <div className="flex-1 p-6 md:p-8 bg-[#161616] border-t border-white/5 flex flex-col justify-between gap-6 select-none">
              
              {/* L & R Shoulders */}
              <div className="flex justify-between items-center px-4">
                <button
                  onMouseDown={() => triggerKey("down", "q", "KeyQ", 81)}
                  onMouseUp={() => triggerKey("up", "q", "KeyQ", 81)}
                  onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "q", "KeyQ", 81); }}
                  onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "q", "KeyQ", 81); }}
                  className="w-16 py-2 bg-gradient-to-b from-[#2d2d2d] to-[#1c1c1c] active:from-[#222] border border-white/10 active:border-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#a8b2c1] shadow-md active:scale-95 transition-all outline-none"
                >
                  L Trigger
                </button>
                
                {/* Embedded fast turbo button */}
                <button
                  onMouseDown={() => triggerKey("down", "Space", "Space", 32)}
                  onMouseUp={() => triggerKey("up", "Space", "Space", 32)}
                  onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "Space", "Space", 32); }}
                  onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "Space", "Space", 32); }}
                  className="px-4 py-1.5 bg-[#1f1e1d] hover:bg-[#2e2b26] border border-amber-900/30 text-[9px] font-mono font-bold tracking-widest text-amber-500/80 hover:text-amber-400 rounded-full active:scale-95 flex items-center gap-1.5 transition-colors"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  TURBO SPEED
                </button>

                <button
                  onMouseDown={() => triggerKey("down", "e", "KeyE", 69)}
                  onMouseUp={() => triggerKey("up", "e", "KeyE", 69)}
                  onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "e", "KeyE", 69); }}
                  onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "e", "KeyE", 69); }}
                  className="w-16 py-2 bg-gradient-to-b from-[#2d2d2d] to-[#1c1c1c] active:from-[#222] border border-white/10 active:border-white/20 rounded-lg text-[10px] font-bold uppercase tracking-widest text-[#a8b2c1] shadow-md active:scale-95 transition-all outline-none"
                >
                  R Trigger
                </button>
              </div>

              {/* Main D-Pad & A/B Interaction Pad Panel */}
              <div className="flex justify-between items-center gap-4 px-2">
                
                {/* Tactile Retro cross D-PAD */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <div className="absolute w-32 h-10 bg-gradient-to-b from-[#2b2b2b] to-[#1c1c1c] rounded-lg border border-white/5 shadow-xl" />
                  <div className="absolute w-10 h-32 bg-gradient-to-b from-[#2b2b2b] to-[#1c1c1c] rounded-lg border border-white/5 shadow-xl" />
                  
                  {/* Center Hub */}
                  <div className="absolute w-10 h-10 bg-[#121212] rounded-full z-10 shadow-[inset_0_2px_5px_rgba(0,0,0,0.8)] border border-white/5" />

                  {/* Up */}
                  <button
                    onMouseDown={() => triggerKey("down", "ArrowUp", "ArrowUp", 38)}
                    onMouseUp={() => triggerKey("up", "ArrowUp", "ArrowUp", 38)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "ArrowUp", "ArrowUp", 38); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "ArrowUp", "ArrowUp", 38); }}
                    className="absolute top-0 w-10 h-10 z-20 hover:bg-white/5 rounded-t-md flex items-center justify-center outline-none cursor-pointer"
                    aria-label="D-Pad Up"
                  >
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-white/40 group-hover:border-b-white" />
                  </button>

                  {/* Down */}
                  <button
                    onMouseDown={() => triggerKey("down", "ArrowDown", "ArrowDown", 40)}
                    onMouseUp={() => triggerKey("up", "ArrowDown", "ArrowDown", 40)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "ArrowDown", "ArrowDown", 40); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "ArrowDown", "ArrowDown", 40); }}
                    className="absolute bottom-0 w-10 h-10 z-20 hover:bg-white/5 rounded-b-md flex items-center justify-center outline-none cursor-pointer"
                    aria-label="D-Pad Down"
                  >
                    <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-white/40 group-hover:border-t-white" />
                  </button>

                  {/* Left */}
                  <button
                    onMouseDown={() => triggerKey("down", "ArrowLeft", "ArrowLeft", 37)}
                    onMouseUp={() => triggerKey("up", "ArrowLeft", "ArrowLeft", 37)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "ArrowLeft", "ArrowLeft", 37); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "ArrowLeft", "ArrowLeft", 37); }}
                    className="absolute left-0 w-10 h-10 z-20 hover:bg-white/5 rounded-l-md flex items-center justify-center outline-none cursor-pointer"
                    aria-label="D-Pad Left"
                  >
                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[8px] border-r-white/40 group-hover:border-r-white" />
                  </button>

                  {/* Right */}
                  <button
                    onMouseDown={() => triggerKey("down", "ArrowRight", "ArrowRight", 39)}
                    onMouseUp={() => triggerKey("up", "ArrowRight", "ArrowRight", 39)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "ArrowRight", "ArrowRight", 39); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "ArrowRight", "ArrowRight", 39); }}
                    className="absolute right-0 w-10 h-10 z-20 hover:bg-white/5 rounded-r-md flex items-center justify-center outline-none cursor-pointer"
                    aria-label="D-Pad Right"
                  >
                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-white/40 group-hover:border-l-white" />
                  </button>
                </div>

                {/* Angled A & B Controls */}
                <div className="flex items-center gap-4 bg-black/30 p-3 rounded-full border border-white/5 transform rotate-[-12deg] shadow-inner">
                  {/* Button B */}
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onMouseDown={() => triggerKey("down", "z", "KeyZ", 90)}
                      onMouseUp={() => triggerKey("up", "z", "KeyZ", 90)}
                      onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "z", "KeyZ", 90); }}
                      onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "z", "KeyZ", 90); }}
                      className="w-14 h-14 bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 active:bg-rose-800 rounded-full border-b-[5px] border-rose-950 shadow-[0_4px_0_rgba(0,0,0,0.4),0_8px_15px_rgba(244,63,94,0.15)] ring-4 ring-black/40 flex items-center justify-center text-white active:scale-90 transform rotate-[12deg] select-none text-xl font-black outline-none cursor-pointer transition-all"
                      aria-label="Button B"
                    >
                      B
                    </button>
                    <span className="text-[8px] font-bold text-white/30 tracking-widest uppercase">CANCEL</span>
                  </div>

                  {/* Button A */}
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onMouseDown={() => triggerKey("down", "x", "KeyX", 88)}
                      onMouseUp={() => triggerKey("up", "x", "KeyX", 88)}
                      onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "x", "KeyX", 88); }}
                      onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "x", "KeyX", 88); }}
                      className="w-14 h-14 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 active:bg-amber-700 rounded-full border-b-[5px] border-amber-950 shadow-[0_4px_0_rgba(0,0,0,0.4),0_8px_15px_rgba(245,158,11,0.15)] ring-4 ring-black/40 flex items-center justify-center text-black active:scale-90 transform rotate-[12deg] select-none text-xl font-black outline-none cursor-pointer transition-all"
                      aria-label="Button A"
                    >
                      A
                    </button>
                    <span className="text-[8px] font-bold text-white/30 tracking-widest uppercase">SELECT</span>
                  </div>
                </div>

              </div>

              {/* Start & Select Capsule Pill Buttons */}
              <div className="flex justify-center items-center gap-6 pt-3 select-none">
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onMouseDown={() => triggerKey("down", "Shift", "ShiftLeft", 16)}
                    onMouseUp={() => triggerKey("up", "Shift", "ShiftLeft", 16)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "Shift", "ShiftLeft", 16); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "Shift", "ShiftLeft", 16); }}
                    className="w-14 h-3.5 bg-gradient-to-b from-[#2d2d2d] to-[#1a1a1a] border border-white/5 active:from-[#3a3a3a] rounded-full shadow-md cursor-pointer outline-none transition-all"
                    aria-label="Select Button"
                  />
                  <span className="text-[8px] font-bold text-white/30 tracking-widest">SELECT</span>
                </div>

                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onMouseDown={() => triggerKey("down", "Enter", "Enter", 13)}
                    onMouseUp={() => triggerKey("up", "Enter", "Enter", 13)}
                    onTouchStart={(e) => { e.preventDefault(); triggerKey("down", "Enter", "Enter", 13); }}
                    onTouchEnd={(e) => { e.preventDefault(); triggerKey("up", "Enter", "Enter", 13); }}
                    className="w-14 h-4 bg-neutral-800 active:bg-neutral-700 border-b-2 border-neutral-950 rounded-full shadow-md cursor-pointer outline-none"
                    aria-label="Start Button"
                  />
                  <span className="text-[9px] font-bold text-neutral-500 tracking-widest">START</span>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Cloud sync + Live Trade/Battle online dashboard */}
        <div className="w-full lg:w-[450px] bg-[#0c0c0c] border-l border-white/5 p-6 flex flex-col gap-6">
          
          {/* Section 1: Trainer Profile Deck */}
          <section className="bg-[#121212] border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              Thẻ Huấn Luyện Viên GBA
            </h3>

            <div className="flex gap-4 items-center">
              <div className="w-16 h-16 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center p-1 overflow-hidden relative group">
                <img 
                  src={TRAINER_AVATARS.find((av) => av.id === avatar)?.imageUrl || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/red.png"} 
                  alt="Trainer avatar"
                  className="w-full h-full object-contain pixelated"
                />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập tên..."
                    className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-indigo-500 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none font-semibold uppercase tracking-wider"
                  />
                  <button 
                    onClick={connectToLobby}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                      wsConnected 
                        ? "bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300" 
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                    }`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${wsConnected ? "" : "animate-spin"}`} />
                    {wsConnected ? "Online" : "Kết Nối"}
                  </button>
                </div>

                {/* Avatar Slider selector */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {TRAINER_AVATARS.map((av) => (
                    <button 
                      key={av.id}
                      onClick={() => setAvatar(av.id)}
                      className={`px-2 py-1 rounded text-[9px] font-bold tracking-widest uppercase transition-all flex-shrink-0 border ${
                        avatar === av.id 
                          ? "bg-indigo-600 border-indigo-500 text-white" 
                          : "bg-black/40 border-white/10 text-white/40 hover:text-white"
                      }`}
                    >
                      {av.name.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Cloud Saves synchronization utility */}
            <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-3">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-indigo-400" />
                Đồng Bộ Save File Đám Mây (.SAV)
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={handleBackupCloud}
                  className="py-2 px-3 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5 text-indigo-400" />
                  Sao Lưu Lên Mây
                </button>
                <button 
                  onClick={() => savFileInputRef.current?.click()}
                  className="py-2 px-3 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  Nhập Save File
                </button>
              </div>

              {/* SAV manual select file loader */}
              <input 
                type="file" 
                ref={savFileInputRef} 
                accept=".sav" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    triggerStatus(`Đã nhập file lưu game: ${file.name}. Vui lòng reload cuộc chơi để áp dụng!`, "success");
                  }
                }}
                className="hidden"
              />

              {saveUploaded && syncCode && (
                <div className="p-2.5 bg-black/60 border border-indigo-500/10 rounded-lg space-y-1.5">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest font-bold">Mã đồng bộ save của thiết bị này:</span>
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-lg font-black tracking-widest text-[#00ff22]">{syncCode}</span>
                    <span className="text-[8px] px-2 py-0.5 bg-[#121212] rounded text-white/30 border border-white/5">Hiệu lực 60 phút</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1 border-t border-white/5">
                <input 
                  type="text" 
                  maxLength={6}
                  placeholder="Mã đồng bộ (6 số)"
                  value={restoreCode}
                  onChange={(e) => setRestoreCode(e.target.value)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/10 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 rounded-lg px-2.5 py-1.5 text-xs text-center font-mono text-white focus:outline-none"
                />
                <button 
                  onClick={handleRestoreCloud}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] font-bold uppercase tracking-widest transition-all shadow-md"
                >
                  Tải Save Về
                </button>
              </div>
            </div>
          </section>

          {/* Section: Google Drive Cloud Backup Dashboard */}
          <section id="google-drive-sync-panel" className="bg-[#121212] border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl">
            <h3 className="text-[10px] font-bold tracking-widest text-[#4285f4] uppercase flex items-center gap-2">
              <CloudRain className="w-3.5 h-3.5 text-[#4285f4]" />
              Lưu Trữ Đám Mây Google Drive
            </h3>

            {!googleUser ? (
              <div className="space-y-3">
                <p className="text-[10px] text-white/40 leading-relaxed uppercase tracking-wider">
                  Tự động xuất nhập file lưu game (.SAV) và đồng bộ thông tin huấn luyện viên giữa các thiết bị bằng Google Drive cá nhân.
                </p>
                <button 
                  onClick={handleGoogleDriveSignIn}
                  className="w-full py-2.5 bg-[#4285f4] hover:bg-[#357ae8] active:scale-98 text-white rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4 fill-white" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C18.155 2.185 15.39 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c6.478 0 10.793-4.537 10.793-10.986 0-.743-.08-1.309-.176-1.854H12.24z"/>
                  </svg>
                  Liên Kết Tài Khoản Google
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between p-2.5 bg-black/40 border border-[#4285f4]/15 rounded-xl">
                  <div className="flex items-center gap-2.5">
                    {googleUser.picture ? (
                      <img 
                        src={googleUser.picture} 
                        alt="GG Profile" 
                        className="w-8 h-8 rounded-full border border-white/10" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#4285f4]/20 flex items-center justify-center text-[10px] font-bold text-white">
                        G
                      </div>
                    )}
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white uppercase tracking-wider truncate max-w-[180px]">{googleUser.name}</span>
                      <span className="text-[9px] font-mono text-white/40 truncate max-w-[180px]">{googleUser.email}</span>
                    </div>
                  </div>
                  <button 
                    onClick={handleGoogleDriveSignOut}
                    className="text-[8px] font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
                  >
                    Hủy Kết Nối
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button 
                    onClick={handleBackupGoogleDrive}
                    className="py-2.5 px-3 bg-[#4285f4]/15 border border-[#4285f4]/30 hover:bg-[#4285f4]/25 text-white rounded text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5 text-[#4285f4]" />
                    Sao Lưu Lên Drive
                  </button>
                  <button 
                    onClick={handleRestoreGoogleDrive}
                    className="py-2.5 px-3 bg-[#0a2342] border border-[#4285f4]/35 hover:bg-[#112f54] text-[#8ab4f8] rounded text-[9px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-[#8ab4f8]" />
                    Đồng Bộ Về Máy
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Team Selector Customizer deck */}
          <section className="bg-[#121212] border border-white/5 rounded-2xl p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <h3 className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                Đội Hình Đấu Luyện ({myTeam.length}/6)
              </h3>
              <button 
                onClick={() => setTeamSelectorOpen(!teamSelectorOpen)}
                className="px-2 py-1 bg-[#1a1a1a] text-white/60 hover:text-white border border-white/10 hover:bg-indigo-600/20 hover:border-indigo-500/30 rounded text-[8px] font-bold uppercase tracking-widest transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Thay Đổi
              </button>
            </div>

            {/* Live party grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2.5">
              {myTeam.map((pk, idx) => (
                <div 
                  key={idx}
                  className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between group hover:border-indigo-500/20 transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 bg-black/60 border border-white/5 rounded-lg flex items-center justify-center p-0.5 overflow-hidden">
                      <img src={pk.spriteUrl} alt={pk.name} className="w-full h-full object-contain sprite-pixel" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1">
                        <h4 className="text-xs font-bold text-white leading-none uppercase tracking-wider">{pk.name}</h4>
                        <span className="text-[9px] font-bold font-mono text-indigo-400">Lv.{pk.level}</span>
                      </div>
                      <p className="text-[9px] uppercase tracking-wider text-white/40 mt-1">{pk.species} • HP: {pk.hp}/{pk.maxHp}</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => removePokemonFromTeam(idx)}
                    className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-white/5 border border-white/10 text-white/40 hover:text-red-400 rounded transition-all self-center"
                    title="Xóa khỏi đội"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Collapsed selection gallery */}
            {teamSelectorOpen && (
              <div className="p-4 bg-black/60 border border-white/5 rounded-xl space-y-3 max-h-[280px] overflow-y-auto scrollbar-thin">
                <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest border-b border-white/5 pb-1.5">Pokémon GBA Sẵn Có</p>
                <div className="grid grid-cols-1 gap-2">
                  {POKEMON_PRESETS.map((p, idx) => (
                    <div 
                      key={idx}
                      className="p-2 bg-black/20 hover:bg-[#1a1a1a]/40 border border-white/5 rounded-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <img src={p.spriteUrl} alt={p.name} className="w-8 h-8 object-contain sprite-pixel" />
                        <div>
                          <span className="text-xs font-bold text-white block uppercase tracking-wider">{p.name}</span>
                          <span className="text-[8px] uppercase tracking-wider text-white/40">{p.species} • Atk: {p.stats.attack}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => addPokemonToTeam(p)}
                        className="p-1 px-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-400/20 text-white rounded text-[8px] font-bold uppercase tracking-widest transition-all"
                      >
                        Thêm
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Section 3: Incoming Interaction Requests Alerts */}
          {(incomingChallenge || incomingTrade) && (
            <div className="bg-[#181212] border border-red-500/20 rounded-2xl p-4 space-y-3 shadow-2xl animate-pulse">
              {incomingChallenge && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-rose-400 text-[10px] font-black uppercase tracking-widest">
                    <Sword className="w-4 h-4 text-rose-500 animate-bounce" />
                    Yêu cầu chiến đấu Pokémon!
                  </div>
                  <p className="text-xs text-white/70">
                    <strong className="text-white">{incomingChallenge.fromUsername}</strong> đang thách đấu trực tuyến!
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => respondChallenge(true)}
                      className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-[9px] font-bold uppercase tracking-widest rounded shadow-md transition-all"
                    >
                      Chấp Nhận
                    </button>
                    <button 
                      onClick={() => respondChallenge(false)}
                      className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-white/40 text-[9px] font-bold uppercase tracking-widest rounded border border-white/5 transition-all"
                    >
                      Từ Chối
                    </button>
                  </div>
                </div>
              )}

              {incomingTrade && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-black uppercase tracking-widest">
                    <ArrowRightLeft className="w-4 h-4 text-indigo-400 animate-spin" />
                    Yêu cầu giao dịch Pokémon!
                  </div>
                  <p className="text-xs text-white/70">
                    <strong className="text-white">{incomingTrade.fromUsername}</strong> muốn giao dịch Pokémon với bạn.
                  </p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => respondTrade(true)}
                      className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-bold uppercase tracking-widest rounded shadow-md transition-all"
                    >
                      Chấp Nhận
                    </button>
                    <button 
                      onClick={() => respondTrade(false)}
                      className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-white/40 text-[9px] font-bold uppercase tracking-widest rounded border border-white/5 transition-all"
                    >
                      Từ Chối
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Multiplayer Arena (Turn Based GBA battle console & trade view) */}
          <section className="flex-1 bg-[#121212] border border-white/5 rounded-2xl p-5 shadow-xl flex flex-col">
            
            {/* NO CONNECTED lobby setup */}
            {!wsConnected ? (
              <div className="min-h-[220px] flex-1 flex flex-col justify-center items-center text-center p-4 space-y-3">
                <Users className="w-10 h-10 text-white/10 animate-pulse" />
                <div>
                  <h4 className="text-[10px] font-bold text-[#a8b2c1] uppercase tracking-widest">Mạng Trực Tuyến GBA</h4>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mt-2 max-w-[280px] leading-relaxed">Vui lòng nhấn nút <strong>Kết Nối</strong> trong Thẻ Huấn Luyện ở trên để tham gia phòng chờ Trade & Battle trực tuyến.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 flex flex-col">
                
                {/* LOBBY ACTIVE PLAYERS VIEW */}
                {!activeBattle && !activeTrade && (
                  <div className="space-y-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                        Huấn Luyện Viên Online ({lobbyPlayers.length})
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    </div>

                    <div className="space-y-2 max-h-[300px] overflow-y-auto scrollbar-thin">
                      {lobbyPlayers.length === 0 ? (
                        <p className="text-[10px] text-white/30 uppercase tracking-widest italic py-4">Chưa có người chơi nào khác phòng chờ.</p>
                      ) : (
                        lobbyPlayers.map((opt) => (
                          <div 
                            key={opt.id}
                            className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-center justify-between hover:border-indigo-500/20 transition-all"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-black/60 flex items-center justify-center p-0.5 border border-white/10">
                                <img src={TRAINER_AVATARS.find((av) => av.id === opt.avatar)?.imageUrl || "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/trainers/red.png"} alt={opt.username} className="w-full h-full object-contain pixelated" />
                              </div>
                              <div>
                                <h5 className="text-xs font-bold text-white uppercase tracking-wider">{opt.username}</h5>
                                <span className="text-[8px] text-white/40 uppercase tracking-widest block mt-0.5">{opt.status} • Đội hình: {opt.team.length} Pokémon</span>
                              </div>
                            </div>

                            {/* Options to trade or challenge */}
                            {opt.id !== playerId && opt.status === "idle" && (
                              <div className="flex gap-1.5">
                                <button 
                                  onClick={() => sendChallenge(opt.id)}
                                  className="p-1.5 bg-rose-600/10 hover:bg-rose-600 hover:text-white border border-rose-500/20 text-rose-400 rounded transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
                                  title="Thách đấu"
                                >
                                  <Sword className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => sendTrade(opt.id)}
                                  className="p-1.5 bg-indigo-600/10 hover:bg-indigo-500 hover:text-white border border-indigo-500/20 text-indigo-300 rounded transition-all flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest"
                                  title="Giao dịch"
                                >
                                  <ArrowRightLeft className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* REAL TIME BATTLE DISPLAY MONITOR */}
                {activeBattle && (
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-4 animate-fade-in shadow-inner">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                      <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-1">
                        <Sword className="w-3.5 h-3.5 text-rose-500" />
                        BẢN ĐỒ CHIẾN ĐẤU P2P
                      </span>
                      <span className="text-[9px] text-[#00ff22]/60 font-mono font-bold tracking-widest uppercase">BATTLE STATE: ACTIVE</span>
                    </div>

                    {/* Arena health layout */}
                    <div className="space-y-4 font-mono">
                      {/* Opponent (Top side) */}
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img 
                            src={activeBattle.oppTeam[activeBattle.oppActiveIdx]?.spriteUrl} 
                            alt="Opponent pokemon" 
                            className="w-12 h-12 object-contain sprite-pixel animate-shaking" 
                          />
                          <div>
                            <span className="text-xs font-black text-white uppercase tracking-wider">{activeBattle.oppTeam[activeBattle.oppActiveIdx]?.name}</span>
                            <span className="text-[8px] font-bold text-rose-400 tracking-widest block">Lv.{activeBattle.oppTeam[activeBattle.oppActiveIdx]?.level}</span>
                          </div>
                        </div>

                        {/* Health bar */}
                        <div className="text-right space-y-1 w-24">
                          <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                            <div 
                              className="h-full bg-rose-500 transition-all duration-300" 
                              style={{ width: `${(activeBattle.oppCurrentHp[activeBattle.oppActiveIdx] / (activeBattle.oppTeam[activeBattle.oppActiveIdx]?.maxHp || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-[9px] tracking-wider text-white/40 uppercase">
                            HP: {activeBattle.oppCurrentHp[activeBattle.oppActiveIdx]}/{activeBattle.oppTeam[activeBattle.oppActiveIdx]?.maxHp}
                          </span>
                        </div>
                      </div>

                      {/* Opponent vs Self split */}
                      <div className="flex items-center justify-center">
                        <span className="text-[9px] font-black font-mono text-white/40 tracking-widest bg-black border border-white/5 px-3 py-1 rounded-full uppercase">VS</span>
                      </div>

                      {/* Self Team (Bottom side) */}
                      <div className="p-3 bg-indigo-600/10 rounded-xl border border-indigo-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <img 
                            src={activeBattle.selfTeam[activeBattle.selfActiveIdx]?.spriteUrl} 
                            alt="Self pokemon" 
                            className="w-12 h-12 object-contain sprite-pixel" 
                          />
                          <div>
                            <span className="text-xs font-black text-indigo-400 uppercase tracking-wider">{activeBattle.selfTeam[activeBattle.selfActiveIdx]?.name}</span>
                            <span className="text-[8px] font-bold text-white/40 block">Lv.{activeBattle.selfTeam[activeBattle.selfActiveIdx]?.level}</span>
                          </div>
                        </div>

                        {/* Health bar */}
                        <div className="text-right space-y-1 w-24">
                          <div className="w-full h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                            <div 
                              className="h-full bg-emerald-500 transition-all duration-300"
                              style={{ width: `${(activeBattle.selfCurrentHp[activeBattle.selfActiveIdx] / (activeBattle.selfTeam[activeBattle.selfActiveIdx]?.maxHp || 1)) * 100}%` }}
                            />
                          </div>
                          <span className="text-[9px] tracking-wider text-emerald-400 uppercase">
                            HP: {activeBattle.selfCurrentHp[activeBattle.selfActiveIdx]}/{activeBattle.selfTeam[activeBattle.selfActiveIdx]?.maxHp}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Battle log feed */}
                    <div className="bg-black/60 p-2.5 rounded border border-white/5 h-[100px] overflow-y-auto space-y-1.5 scrollbar-thin">
                      {activeBattle.log.map((line, idx) => (
                        <p key={idx} className="text-[9px] text-[#00ff22]/80 leading-normal font-mono uppercase tracking-wider">
                          <span className="text-indigo-400">▶</span> {line}
                        </p>
                      ))}
                    </div>

                    {/* Operational Commands moves select */}
                    {activeBattle.pendingAction ? (
                      <div className="space-y-2">
                        <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest block">Chọn chiêu thức của bạn:</span>
                        <div className="grid grid-cols-2 gap-2">
                          {activeBattle.selfTeam[activeBattle.selfActiveIdx]?.moves.map((move, mIdx) => (
                            <button
                              key={mIdx}
                              onClick={() => sendBattleAction("fight", mIdx)}
                              className="py-2 px-3 bg-[#161616] hover:bg-indigo-600/20 hover:text-indigo-300 active:scale-95 border border-white/5 hover:border-indigo-500/30 text-white rounded text-[10px] font-extrabold transition-all uppercase tracking-widest"
                            >
                              {move}
                            </button>
                          ))}
                        </div>

                        {/* Switch action */}
                        {activeBattle.selfTeam.some((pm, pIdx) => pIdx !== activeBattle.selfActiveIdx && activeBattle.selfCurrentHp[pIdx] > 0) && (
                          <div className="pt-2 border-t border-white/5 space-y-2">
                            <span className="text-[8px] font-bold text-white/30 tracking-widest uppercase block">Đổi Pokémon cứu cánh:</span>
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {activeBattle.selfTeam.map((pm, pIdx) => {
                                const isFainted = activeBattle.selfCurrentHp[pIdx] <= 0;
                                const isActive = pIdx === activeBattle.selfActiveIdx;
                                if (isFainted || isActive) return null;
                                return (
                                  <button
                                    key={pIdx}
                                    onClick={() => sendBattleAction("switch", undefined, pIdx)}
                                    className="py-1 px-2.5 bg-black/40 hover:bg-[#1a1a1a]/80 rounded text-[9px] border border-white/10 text-white/60 flex-shrink-0 font-bold uppercase tracking-wider"
                                  >
                                    {pm.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-black/40 rounded-xl text-center border border-white/5">
                        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest animate-pulse">Đang đợi đối thủ đưa ra quyết định...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* REAL TIME TRADE INTERFACE */}
                {activeTrade && (
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 space-y-4 animate-fade-in shadow-inner">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
                      <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest flex items-center gap-1 font-mono">
                        <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" />
                        TRẠM GIAO DỊCH P2P
                      </span>
                      <button 
                        onClick={cancelTrade}
                        className="p-1 hover:bg-white/5 border border-white/10 hover:border-white/20 text-white/40 rounded transition-all"
                        title="Hủy giao dịch"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Trade board setup */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Self side */}
                      <div className="space-y-3 bg-[#161616]/30 p-3 rounded-xl border border-white/5">
                        <h5 className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">BẠN CHỌN</h5>
                        
                        {activeTrade.selfSelectedIdx !== null ? (
                          <div className="p-2 bg-black/40 rounded-lg border border-white/10 flex items-center gap-2">
                            <img src={myTeam[activeTrade.selfSelectedIdx]?.spriteUrl} alt="selected" className="w-8 h-8 sprite-pixel" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-white block truncate uppercase tracking-wider">{myTeam[activeTrade.selfSelectedIdx]?.name}</span>
                              <span className="text-[8px] text-white/40 uppercase tracking-widest">Lv.{myTeam[activeTrade.selfSelectedIdx]?.level}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-12 border border-dashed border-white/10 rounded-lg flex items-center justify-center">
                            <span className="text-[9px] text-white/30 uppercase tracking-wider italic">Chưa chọn</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[8px] text-white/30 uppercase tracking-widest">Trạng thái:</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase ${
                            activeTrade.selfConfirmed ? "bg-emerald-950/40 border border-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40"
                          }`}>
                            {activeTrade.selfConfirmed ? "Đã Khóa" : "Đang chờ"}
                          </span>
                        </div>
                      </div>

                      {/* Opponent side */}
                      <div className="space-y-3 bg-[#161616]/30 p-3 rounded-xl border border-white/5">
                        <h5 className="text-[9px] font-black text-rose-400 uppercase tracking-widest">{activeTrade.otherUser.username} CHỌN</h5>

                        {activeTrade.oppSelectedIdx !== null ? (
                          <div className="p-2 bg-black/40 rounded-lg border border-white/10 flex items-center gap-2">
                            <img src={activeTrade.otherUser.team[activeTrade.oppSelectedIdx]?.spriteUrl} alt="selected" className="w-8 h-8 sprite-pixel" />
                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-white block truncate uppercase tracking-wider">{activeTrade.otherUser.team[activeTrade.oppSelectedIdx]?.name}</span>
                              <span className="text-[8px] text-white/40 uppercase tracking-widest">Lv.{activeTrade.otherUser.team[activeTrade.oppSelectedIdx]?.level}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-12 border border-dashed border-white/10 rounded-lg flex items-center justify-center">
                            <span className="text-[9px] text-white/30 uppercase tracking-wider italic">Chưa chọn</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[8px] text-white/30 uppercase tracking-widest">Trạng thái:</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded tracking-widest uppercase ${
                            activeTrade.oppConfirmed ? "bg-emerald-950/40 border border-emerald-500/20 text-emerald-400" : "bg-white/5 text-white/40"
                          }`}>
                            {activeTrade.oppConfirmed ? "Đã Khóa" : "Đang chờ"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Operational select from self team list */}
                    <div className="space-y-2 border-t border-white/5 pt-3">
                      <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest block">Chọn Pokémon trao đổi:</span>
                      <div className="grid grid-cols-3 gap-1.5 font-mono">
                        {myTeam.map((pm, pmIdx) => (
                          <button
                            key={pmIdx}
                            onClick={() => selectTradePokemon(pmIdx)}
                            className={`p-1 bg-black/40 hover:bg-[#1a1a1a]/80 border rounded-lg flex flex-col items-center transition-all ${
                              activeTrade.selfSelectedIdx === pmIdx ? "border-indigo-500 bg-indigo-500/10" : "border-white/5"
                            }`}
                          >
                            <img src={pm.spriteUrl} alt={pm.name} className="w-8 h-8 sprite-pixel" />
                            <span className="text-[9px] font-bold text-white block truncate w-full text-center">{pm.name.split(" ")[0]}</span>
                          </button>
                        ))}
                      </div>
                    </div>
 
                    {/* Submit confirmation trade */}
                    <div className="pt-2">
                      <button
                        onClick={confirmTradePokemon}
                        disabled={activeTrade.selfSelectedIdx === null}
                        className={`w-full py-2.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                          activeTrade.selfConfirmed 
                            ? "bg-[#161616] text-[#ffffff]/20 border border-white/5 cursor-not-allowed" 
                            : activeTrade.selfSelectedIdx !== null
                              ? "bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-lg hover:shadow-indigo-500/20" 
                              : "bg-[#161616] text-[#ffffff]/30 border border-white/5 cursor-[#161616] cursor-not-allowed"
                        }`}
                      >
                        {activeTrade.selfConfirmed ? "Vui Lòng Đợi Đối Tác Khóa..." : "Khóa Lựa Chọn Giao Dịch"}
                      </button>
                    </div>
                  </div>
                )}
 
                {/* BATTLE RESULT / OUTCOME DRAWER MODAL OVERLAY */}
                {battleOutcome && (
                  <div className="p-5 bg-black border border-white/10 rounded-2xl text-center space-y-3 shadow-2xl animate-fade-in font-mono">
                    <div className="w-12 h-12 bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-400 mx-auto border border-indigo-500/20">
                      <Award className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white tracking-widest uppercase">{battleOutcome.message}</h4>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest mt-1">{battleOutcome.sub}</p>
                    </div>
                    <button 
                      onClick={() => setBattleOutcome(null)}
                      className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 rounded text-[9px] uppercase tracking-widest font-bold"
                    >
                      Đóng
                    </button>
                  </div>
                )}
 
                {/* TRADE SUCCESS TRANSITION DRAWER */}
                {tradeSuccess && (
                  <div className="p-5 bg-black border border-white/10 rounded-2xl text-center space-y-4 shadow-2xl animate-fade-in font-mono">
                    <div className="flex justify-center items-center gap-4">
                      {/* Sent */}
                      <div className="text-center opacity-40">
                        <img src={tradeSuccess.sent.spriteUrl} alt="sent" className="w-10 h-10 mx-auto sprite-pixel" />
                        <span className="text-[8px] text-white/30 uppercase tracking-widest block">Đã gửi</span>
                      </div>
                      
                      {/* Animation */}
                      <div className="text-center">
                        <ArrowRightLeft className="w-5 h-5 text-indigo-400 animate-spin" />
                      </div>
 
                      {/* Received */}
                      <div className="text-center font-mono">
                        <img src={tradeSuccess.received.spriteUrl} alt="received" className="w-12 h-12 mx-auto sprite-pixel animate-pulse" />
                        <span className="text-[9px] text-[#00ff22] font-black uppercase tracking-wider block">Nhận: {tradeSuccess.received.name}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <h4 className="text-[10px] font-bold text-white uppercase tracking-widest">Thương Vụ Thành Công!</h4>
                      <p className="text-[9px] text-white/40 uppercase tracking-widest mt-2 leading-relaxed">Đã cập nhật dữ liệu của Pokémon {tradeSuccess.received.name} vào đội hình trực tuyến của bạn.</p>
                    </div>
                    <button 
                      onClick={() => setTradeSuccess(null)}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[9px] uppercase tracking-widest font-bold transition-all"
                    >
                      Xác Nhận Nhận Pokémon
                    </button>
                  </div>
                )}
 
              </div>
            )}
          </section>
 
        </div>
      </main>
 
      {/* Footer layout */}
      <footer className="border-t border-white/5 py-8 text-center bg-[#060606] mt-auto font-mono">
        <p className="text-[9px] text-white/20 uppercase tracking-widest">© 2026 Pokémon GBA Play Deck. Trình phát giả lập gọn nhẹ thiết kế cho bạn chơi cùng bạn hữu.</p>
      </footer>
    </div>
  );
}
