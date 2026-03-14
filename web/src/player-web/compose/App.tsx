import { createBrowserAppServices } from "@player-web/compose/createBrowserAppServices";
import { PlayerApp } from "@player-web/impl/PlayerApp";

const services = createBrowserAppServices();

export function App() {
  return <PlayerApp services={services} />;
}
