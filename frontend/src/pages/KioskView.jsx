import { useEffect, useState } from "react";
import KioskHero from "../components/kiosk/KioskHero.jsx";
import KioskOpsBoard from "../components/kiosk/KioskOpsBoard.jsx";
import KioskRoomWall from "../components/kiosk/KioskRoomWall.jsx";
import KioskTimelineBoard from "../components/kiosk/KioskTimelineBoard.jsx";

export default function KioskView({
  roomRegistry,
  roomStates,
  chronos,
  gatewayStatus,
  approvalQueues,
  operationsQueues,
  evidenceSnapshot,
  telemetrySnapshot,
  brainModules,
  tunnelFabric,
  agentGatewayState
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="tv-screen">
      <KioskHero
        roomRegistry={roomRegistry}
        roomStates={roomStates}
        chronos={chronos}
        gatewayStatus={gatewayStatus}
        approvalQueues={approvalQueues}
        evidenceSnapshot={evidenceSnapshot}
        telemetrySnapshot={telemetrySnapshot}
        brainModules={brainModules}
        tunnelFabric={tunnelFabric}
        now={now}
      />

      <section className="tv-main-grid">
        <KioskTimelineBoard chronos={chronos} now={now} />
        <KioskOpsBoard
          gatewayStatus={gatewayStatus}
          approvalQueues={approvalQueues}
          operationsQueues={operationsQueues}
          tunnelFabric={tunnelFabric}
          evidenceSnapshot={evidenceSnapshot}
          brainModules={brainModules}
          agentGatewayState={agentGatewayState}
        />
      </section>

      <KioskRoomWall roomRegistry={roomRegistry} roomStates={roomStates} />
    </main>
  );
}
