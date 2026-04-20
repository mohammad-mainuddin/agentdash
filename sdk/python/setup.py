from setuptools import setup, find_packages

setup(
    name="agentdash",
    version="1.0.0",
    description="Python SDK for AgentDash — real-time AI agent monitoring",
    author="AgentDash Contributors",
    license="MIT",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "websocket-client>=1.7.0",
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Topic :: Software Development :: Debuggers",
    ],
)
