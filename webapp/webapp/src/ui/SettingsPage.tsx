interface SettingsPageProps {
  stateMode: boolean
  twoUserMode: boolean
  temperatureUnit: 'celsius' | 'fahrenheit'
  onStateModeChange: (enabled: boolean) => void
  onTwoUserModeChange: (enabled: boolean) => void
  onTemperatureUnitChange: (unit: 'celsius' | 'fahrenheit') => void
  onBack: () => void
}

export const SettingsPage = ({
  stateMode,
  twoUserMode,
  temperatureUnit,
  onStateModeChange,
  onTwoUserModeChange,
  onTemperatureUnitChange,
  onBack,
}: SettingsPageProps) => (
  <main className="settings-shell">
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-header">
        <button type="button" className="secondary-button" onClick={onBack}>
          ← Back to map
        </button>
        <h1 id="settings-title">Settings</h1>
      </div>

      <label className="settings-row">
        <span>
          <strong>Two-user mode</strong>
          <small>Enables you to track visits for two users simultaneously.</small>
        </span>
        <input
          type="checkbox"
          checked={twoUserMode}
          onChange={(event) => onTwoUserModeChange(event.target.checked)}
        />
      </label>

      <label className="settings-row">
        <span>
          <strong>State mode</strong>
          <small>Track the 5 biggest countries by state or province.</small>
        </span>
        <input
          type="checkbox"
          checked={stateMode}
          onChange={(event) => onStateModeChange(event.target.checked)}
        />
      </label>

      <fieldset className="settings-row settings-temperature">
        <legend>
          <strong>Temperature unit</strong>
          <small>Choose the unit shown in the weather display.</small>
        </legend>
        <div className="segmented-control" aria-label="Temperature unit">
          <button
            type="button"
            className={temperatureUnit === 'celsius' ? 'active' : ''}
            aria-pressed={temperatureUnit === 'celsius'}
            onClick={() => onTemperatureUnitChange('celsius')}
          >
            Celsius
          </button>
          <button
            type="button"
            className={temperatureUnit === 'fahrenheit' ? 'active' : ''}
            aria-pressed={temperatureUnit === 'fahrenheit'}
            onClick={() => onTemperatureUnitChange('fahrenheit')}
          >
            Fahrenheit
          </button>
        </div>
      </fieldset>
    </section>
  </main>
)
