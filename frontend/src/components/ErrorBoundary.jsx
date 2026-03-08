import React from "react";

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div className="center">Something broke. SOC team notified 🚨</div>;
    }
    return this.props.children;
  }
}
