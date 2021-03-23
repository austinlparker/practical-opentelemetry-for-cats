import { useState } from 'react';
import { BaseOpenTelemetryComponent } from '@opentelemetry/plugin-react-load'
import { context, getSpan, setSpan } from '@opentelemetry/api';
import Tracer from './tracer.js'

const tracer = Tracer('web')

class Form extends BaseOpenTelemetryComponent {
  constructor(props){
    super(props)
    this.state = {
      option: '',
      results: []
    }
    this.setOption = this.setOption.bind(this)
    this.getActivity = this.getActivity.bind(this)
    this.setResults = this.setResults.bind(this)
  }

  async getActivity(event) {
    event.preventDefault()
    const getActivitySpan = tracer.startSpan('fetchActivity')
    context.with(setSpan(context.active(), getActivitySpan), async () => {
      const res = await fetch(`http://localhost:8080/getActivity?type=${this.state.option}`, {
        method: 'POST',
        mode: 'cors',
      });
      const result = await res.text()
      this.setResults(JSON.parse(result))
      getActivitySpan.end()
    })
    
  }

  setOption(event) {
    this.setState({option: event.target.value})
  }

  setResults(value) {
    this.setState({results: value})
  }

  render() {
    return (
    <div>
    <form className="activityForm" onSubmit={this.getActivity}>
      <label htmlFor="activityType">Select an activity type.</label>
      <select name="activityType" id="activityType" onChange={this.setOption}>
        <option value="education">Educational</option>
        <option value="recreational">Recreational</option>
        <option value="social">Social</option>
        <option value="diy">DIY</option>
        <option value="charity">Charity</option>
        <option value="cooking">Cooking</option>
        <option value="relaxation">Relaxation</option>
        <option value="music">Music</option>
        <option value="busywork">Busywork</option>
        <option value="">Random</option>
      </select>
      <button type="submit">Find an Activity!</button>
    </form>
      {this.state.results.activity}
    </div>
  )
  }
  
}

export default Form;