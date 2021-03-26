import React from 'react';
import { context, setSpan, SpanStatusCode, trace } from '@opentelemetry/api';

const tracer = trace.getTracer('web')

class Form extends React.Component {
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

  getActivity(event) {
    event.preventDefault()
    const getActivitySpan = tracer.startSpan('fetchActivity')
    context.with(setSpan(context.active(), getActivitySpan), () => {
      const req = new Request(`http://localhost:8080/getActivity?type=${this.state.option}`, {method:'POST'})
      fetch(req)
        .then(res => res.text())
        .then(text => this.setResults(JSON.parse(text)))
        .catch(err => {
          getActivitySpan.setStatus(SpanStatusCode.ERROR)
          getActivitySpan.addEvent(err.message)
        })
        .finally(() => getActivitySpan.end())
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