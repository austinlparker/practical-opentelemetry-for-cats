import './App.css';
import Form from './Form';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load';

class App extends BaseOpenTelemetryComponent {
  render() {
    return (
    <div className="App">
      <h1>Hello, World!</h1>
      <Form />
    </div>
  );
  }
}

export default App;
